"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "./supabase/client";
import { notify } from "./notify";

/** Friendly names for notifications */
export const TABLE_LABEL: Record<string, string> = {
  tasks: "Task", members: "Person", characters: "Character", events: "Calendar item", event_blocks: "Agenda block",
  availability: "Availability", reports: "Report", report_sections: "Report note", attendance: "Attendance",
  scripts: "Script", script_marks: "Script mark", cues: "Cue", scenes: "Breakdown row", props: "Prop", line_notes: "Line note", links: "Link",
};
// Deleting these also deletes child rows, so they are not offered an Undo.
const NO_UNDO = new Set(["events", "reports", "scripts", "members", "productions"]);

export function rowName(r: Record<string, unknown> | undefined | null): string {
  if (!r) return "";
  const v = r.title ?? r.name ?? r.display_name ?? r.agenda ?? (r.dept ? `${r.dept} ${r.number ?? ""}` : null) ?? r.text ?? r.character ?? r.french_scene ?? r.unit ?? r.date;
  return v ? String(v).slice(0, 80) : "";
}

type Opts = {
  /** column to filter on, default production_id */
  column?: string;
  order?: { column: string; ascending?: boolean }[];
  select?: string;
  /** subscribe to realtime changes (table must be in supabase_realtime publication) */
  realtime?: boolean;
  enabled?: boolean;
  /** show create / save / delete toasts (default true) */
  notify?: boolean;
  /** entity name in toasts, defaults to TABLE_LABEL[table] */
  label?: string;
};

/**
 * Generic list hook for a production-scoped table with optimistic CRUD and
 * optional realtime sync. Returns rows sorted per `order` on load; realtime
 * inserts are appended and re-sorted by the first order column.
 */
export function useRows<T extends { id: string }>(table: string, value: string | null | undefined, opts: Opts = {}) {
  const { column = "production_id", order = [], select = "*", realtime = true, enabled = true, notify: doNotify = true } = opts;
  const label = opts.label ?? TABLE_LABEL[table] ?? "Item";
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const orderKey = JSON.stringify(order);
  const orderRef = useRef(order);
  orderRef.current = order;

  const sortRows = useCallback((list: T[]) => {
    const o = orderRef.current;
    if (!o.length) return list;
    return [...list].sort((a, b) => {
      for (const { column: c, ascending = true } of o) {
        const av = (a as Record<string, unknown>)[c] as string | number | null;
        const bv = (b as Record<string, unknown>)[c] as string | number | null;
        if (av === bv) continue;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
  }, []);

  const load = useCallback(async () => {
    if (!value || !enabled) return;
    setLoading(true);
    const sb = supabaseBrowser();
    // Page through results: PostgREST caps responses (default 1000 rows).
    const PAGE = 1000;
    const all: T[] = [];
    for (let from = 0; from < 100_000; from += PAGE) {
      let q = sb.from(table).select(select).eq(column, value);
      for (const o of orderRef.current) q = q.order(o.column, { ascending: o.ascending ?? true, nullsFirst: false });
      q = q.order("id", { ascending: true }).range(from, from + PAGE - 1);
      const { data, error } = await q;
      if (error) { setError(error.message); break; }
      const chunk = (data as unknown as T[]) ?? [];
      all.push(...chunk);
      if (chunk.length < PAGE) break;
    }
    setRows(all);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, value, column, select, enabled, orderKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!realtime || !value || !enabled) return;
    const sb = supabaseBrowser();
    const ch = sb
      .channel(`rows:${table}:${column}:${value}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `${column}=eq.${value}` },
        (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          setRows((cur) => {
            if (payload.eventType === "DELETE") return cur.filter((r) => r.id !== payload.old.id);
            const row = payload.new as unknown as T;
            const exists = cur.some((r) => r.id === row.id);
            const next = exists ? cur.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [...cur, row];
            return sortRows(next);
          });
        }
      )
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [table, column, value, realtime, enabled, sortRows]);

  const insert = useCallback(async (row: Partial<T>) => {
    const sb = supabaseBrowser();
    const { data, error } = await sb.from(table).insert(row).select(select).single();
    if (error) { setError(error.message); if (doNotify) notify.error(error.message); throw error; }
    const created = data as unknown as T;
    setRows((cur) => (cur.some((r) => r.id === created.id) ? cur : sortRows([...cur, created])));
    if (doNotify) notify.created(label, rowName(created as unknown as Record<string, unknown>), NO_UNDO.has(table) ? undefined : async () => {
      setRows((cur) => cur.filter((r) => r.id !== created.id));
      await supabaseBrowser().from(table).delete().eq("id", created.id);
    });
    return created;
  }, [table, select, sortRows, doNotify, label]);

  const insertMany = useCallback(async (list: Partial<T>[]) => {
    if (!list.length) return [];
    const sb = supabaseBrowser();
    const { data, error } = await sb.from(table).insert(list).select(select);
    if (error) { setError(error.message); if (doNotify) notify.error(error.message); throw error; }
    const created = (data as unknown as T[]) ?? [];
    setRows((cur) => sortRows([...cur.filter((r) => !created.some((c) => c.id === r.id)), ...created]));
    if (doNotify) notify.created(created.length === 1 ? label : `${created.length} × ${label}`);
    return created;
  }, [table, select, sortRows, doNotify, label]);

  const update = useCallback(async (id: string, patch: Partial<T>) => {
    setRows((cur) => sortRows(cur.map((r) => (r.id === id ? { ...r, ...patch } : r))));
    const sb = supabaseBrowser();
    const { error } = await sb.from(table).update(patch).eq("id", id);
    if (error) { setError(error.message); if (doNotify) notify.error(error.message); load(); throw error; }
    if (doNotify) notify.saved(label);
  }, [table, load, sortRows, doNotify, label]);

  /** Insert-or-update on a unique constraint (e.g. "member_id,date"). */
  const upsert = useCallback(async (list: Partial<T>[], onConflict: string) => {
    if (!list.length) return [];
    const sb = supabaseBrowser();
    const out: T[] = [];
    for (let i = 0; i < list.length; i += 500) {
      const { data, error } = await sb.from(table).upsert(list.slice(i, i + 500), { onConflict }).select(select);
      if (error) { setError(error.message); if (doNotify) notify.error(error.message); throw error; }
      out.push(...((data as unknown as T[]) ?? []));
    }
    setRows((cur) => {
      const map = new Map(cur.map((r) => [r.id, r]));
      out.forEach((r) => map.set(r.id, r));
      return sortRows(Array.from(map.values()));
    });
    if (doNotify) notify.saved(list.length > 1 ? `${list.length} × ${label}` : label);
    return out;
  }, [table, select, sortRows, doNotify, label]);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const remove = useCallback(async (id: string) => {
    const snapshot = rowsRef.current.find((r) => r.id === id);
    setRows((cur) => cur.filter((r) => r.id !== id));
    const sb = supabaseBrowser();
    const { error } = await sb.from(table).delete().eq("id", id);
    if (error) { setError(error.message); if (doNotify) notify.error(error.message); load(); throw error; }
    if (doNotify) notify.deleted(label, rowName(snapshot as unknown as Record<string, unknown>), snapshot && !NO_UNDO.has(table) ? async () => {
      const { data, error: e2 } = await supabaseBrowser().from(table).insert(snapshot).select(select).single();
      if (e2) { notify.error(e2.message); return; }
      setRows((cur) => (cur.some((r) => r.id === id) ? cur : sortRows([...cur, data as unknown as T])));
      notify.info(`${label} restored`);
    } : undefined);
  }, [table, load, doNotify, label, select, sortRows]);

  /** Delete many rows at once, with one Undo for the whole batch. */
  const removeMany = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const snapshots = rowsRef.current.filter((r) => ids.includes(r.id));
    setRows((cur) => cur.filter((r) => !ids.includes(r.id)));
    const sb = supabaseBrowser();
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from(table).delete().in("id", ids.slice(i, i + 200));
      if (error) { setError(error.message); if (doNotify) notify.error(error.message); load(); throw error; }
    }
    if (doNotify) notify.deleted(`${ids.length} × ${label}`, undefined, NO_UNDO.has(table) ? undefined : async () => {
      for (let i = 0; i < snapshots.length; i += 200) {
        const { error: e2 } = await supabaseBrowser().from(table).insert(snapshots.slice(i, i + 200));
        if (e2) { notify.error(e2.message); return; }
      }
      setRows((cur) => sortRows([...cur.filter((r) => !ids.includes(r.id)), ...snapshots]));
      notify.info(`${snapshots.length} × ${label} restored`);
    });
  }, [table, load, doNotify, label, sortRows]);

  return { rows, setRows, loading, error, setError, reload: load, insert, insertMany, update, upsert, remove, removeMany };
}
