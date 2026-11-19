"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { LinkChips } from "@/components/LinkChips";
import { ConfirmButton, ErrorNote, Modal } from "@/components/ui";
import { cx } from "@/lib/utils";

export type GridColumn<T> = {
  key: keyof T & string;
  label: string;
  width?: number;
  type?: "text" | "multiline" | "select" | "number" | "date" | "checkbox";
  options?: { value: string; label: string }[];
  render?: (row: T) => React.ReactNode;   // read-only custom cell
  sticky?: boolean;
};

type Api<T> = {
  rows: T[];
  update: (id: string, patch: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeMany?: (ids: string[]) => Promise<void>;
  insert: (row: Partial<T>) => Promise<T>;
  insertMany: (rows: Partial<T>[]) => Promise<T[]>;
  error: string | null;
};

const SEL_W = 34, NUM_W = 36;
const hasValue = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "" && v !== false;

/**
 * Spreadsheet-like table for production lists (breakdown, cues, props, line notes).
 * - Header row and first column stay visible while scrolling (the table scrolls inside its own box)
 * - Column counts show how many rows have content; hide/show columns; hide empty columns
 * - Search across all columns; select rows and delete them in one go (with Undo)
 * - Cells save on blur; links in cells become clickable chips
 * - Rows can be added, inserted, reordered and pasted from Excel / Google Sheets
 */
export function EditableGrid<T extends { id: string; sort_order?: number }>({
  api, columns, editable, newRow, rows: rowsOverride, groupBy, minWidth = 900, orderKey = "sort_order", storageKey,
}: {
  api: Api<T>; columns: GridColumn<T>[]; editable: boolean; newRow: () => Partial<T>;
  rows?: T[]; groupBy?: (r: T) => string; minWidth?: number; orderKey?: keyof T & string; storageKey?: string;
}) {
  const allRows = rowsOverride ?? api.rows;
  const [paste, setPaste] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [colMenu, setColMenu] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: false });
  const box = useRef<HTMLDivElement>(null);
  const key = `cb-cols-${storageKey ?? columns.map((c) => c.key).join(",").slice(0, 80)}`;

  useEffect(() => { try { const v = localStorage.getItem(key); if (v) setHidden(new Set(JSON.parse(v))); } catch { /* ignore */ } }, [key]);
  const saveHidden = (h: Set<string>) => { setHidden(h); try { localStorage.setItem(key, JSON.stringify(Array.from(h))); } catch { /* ignore */ } };

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return allRows;
    return allRows.filter((r) => columns.some((c) => String((r as Record<string, unknown>)[c.key] ?? "").toLowerCase().includes(n)));
  }, [allRows, q, columns]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    columns.forEach((c) => { m[c.key] = allRows.filter((r) => hasValue((r as Record<string, unknown>)[c.key])).length; });
    return m;
  }, [allRows, columns]);

  const visible = columns.filter((c) => !hidden.has(c.key));
  const firstKey = visible.find((c) => !c.render)?.key;

  const measure = () => {
    const el = box.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => { measure(); const h = () => measure(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); });

  // drop selections that no longer exist
  useEffect(() => { setSelected((cur) => new Set(Array.from(cur).filter((id) => allRows.some((r) => r.id === id)))); }, [allRows]);

  async function move(row: T, dir: -1 | 1) {
    const i = allRows.findIndex((r) => r.id === row.id);
    const other = allRows[i + dir];
    if (!other) return;
    const a = Number((row as Record<string, unknown>)[orderKey] ?? i);
    const b = Number((other as Record<string, unknown>)[orderKey] ?? i + dir);
    await Promise.all([
      api.update(row.id, { [orderKey]: b === a ? a + dir : b } as Partial<T>),
      api.update(other.id, { [orderKey]: a } as Partial<T>),
    ]);
  }

  async function addAfter(row?: T) {
    const base = newRow();
    if (orderKey === "sort_order") {
      const idx = row ? Number(row.sort_order ?? 0) + 1 : (allRows.length ? Math.max(...allRows.map((r) => Number(r.sort_order ?? 0))) + 1 : 0);
      if (row) {
        const later = allRows.filter((r) => Number(r.sort_order ?? 0) >= idx);
        await Promise.all(later.map((r) => api.update(r.id, { sort_order: Number(r.sort_order ?? 0) + 1 } as Partial<T>)));
      }
      await api.insert({ ...base, sort_order: idx } as Partial<T>);
    } else await api.insert(base);
    setTimeout(() => { if (!row && box.current) box.current.scrollTop = box.current.scrollHeight; }, 100);
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    if (api.removeMany) await api.removeMany(ids);
    else for (const id of ids) await api.remove(id);
    setSelected(new Set());
  }

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const stickyLeft = (k: string) => (k === firstKey ? (editable ? SEL_W : 0) + NUM_W : undefined);
  let lastGroup: string | null = null;
  const span = visible.length + (editable ? 3 : 1);

  return (
    <div className="space-y-2">
      <ErrorNote msg={api.error} />
      <div className="no-print flex flex-wrap items-center gap-2">
        {editable && <button className="btn btn-primary btn-sm" onClick={() => addAfter()}>+ Row</button>}
        {editable && <button className="btn btn-sm" onClick={() => setPaste(true)}>Paste from Excel / Sheets</button>}
        <input className="input w-48 py-1 text-xs" placeholder="Search this table…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="relative">
          <button className="btn btn-sm" onClick={() => setColMenu(!colMenu)}>Columns{hidden.size ? ` (${visible.length}/${columns.length})` : ""} ▾</button>
          {colMenu && (
            <div className="card absolute left-0 z-40 mt-1 max-h-80 w-64 overflow-y-auto p-2 text-sm" onMouseLeave={() => setColMenu(false)}>
              <div className="mb-1 flex gap-1">
                <button className="btn btn-sm flex-1" onClick={() => saveHidden(new Set())}>Show all</button>
                <button className="btn btn-sm flex-1" onClick={() => saveHidden(new Set(columns.filter((c) => !c.render && counts[c.key] === 0).map((c) => c.key)))}>Hide empty</button>
              </div>
              {columns.filter((c) => c.label).map((c) => (
                <label key={c.key} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-paper">
                  <span className="flex items-center gap-1.5">
                    <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => { const h = new Set(hidden); if (h.has(c.key)) h.delete(c.key); else h.add(c.key); saveHidden(h); }} />
                    {c.label}
                  </span>
                  <span className={cx("text-xs", counts[c.key] ? "font-semibold text-cue" : "text-ink-mute")}>{counts[c.key]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <span className="text-xs text-ink-mute">{q ? `${rows.length} of ${allRows.length}` : `${allRows.length}`} rows</span>
        {editable && selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-md bg-ink px-2 py-1 text-xs text-white">
            <span className="font-semibold">{selected.size} selected</span>
            <ConfirmButton className="bg-white text-red-700" onConfirm={deleteSelected} label={`Delete ${selected.size}?`}>Delete selected</ConfirmButton>
            <button className="underline" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
      </div>

      <div className="relative">
        {edges.left && <div className="pointer-events-none absolute inset-y-0 z-20 w-6 bg-gradient-to-r from-black/15 to-transparent" style={{ left: (editable ? SEL_W : 0) + NUM_W + (firstKey ? (columns.find((c) => c.key === firstKey)?.width ?? 120) : 0) }} />}
        {edges.right && (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 rounded-r-lg bg-gradient-to-l from-black/20 to-transparent" />
            <button className="no-print absolute right-2 top-1/2 z-30 -translate-y-1/2 rounded-full bg-ink px-2.5 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-ink-soft"
              title="More columns to the right" onClick={() => box.current?.scrollBy({ left: 420, behavior: "smooth" })}>›</button>
          </>
        )}
        {edges.left && (
          <button className="no-print absolute left-2 top-1/2 z-30 -translate-y-1/2 rounded-full bg-ink px-2.5 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-ink-soft"
            title="Scroll left" onClick={() => box.current?.scrollBy({ left: -420, behavior: "smooth" })}>‹</button>
        )}
        <div ref={box} onScroll={measure} className="card max-h-[calc(100vh-13rem)] min-h-[240px] overflow-auto print:max-h-none print:overflow-visible">
          <table className="table-sm" style={{ minWidth }}>
            <thead>
              <tr>
                {editable && (
                  <th className="no-print sticky left-0 bg-paper" style={{ width: SEL_W, minWidth: SEL_W, zIndex: 31 }}>
                    <input type="checkbox" aria-label="Select all" checked={allVisibleSelected} onChange={toggleAll} />
                  </th>
                )}
                <th className="sticky bg-paper" style={{ left: editable ? SEL_W : 0, width: NUM_W, minWidth: NUM_W, zIndex: 31 }}>#</th>
                {visible.map((c) => (
                  <th key={c.key} className={cx(c.key === firstKey && "shadow-[1px_0_0_#e6e1d7]")}
                    style={{ width: c.width, minWidth: c.width, left: stickyLeft(c.key), position: "sticky", zIndex: c.key === firstKey ? 31 : 20 }}>
                    <span className="flex items-center gap-1">
                      {c.label}
                      {c.label && <span className={cx("rounded px-1 text-[10px] font-bold normal-case", counts[c.key] ? "bg-cue-soft text-cue" : "text-ink-mute/60")} title={`${counts[c.key]} rows have something here`}>{counts[c.key]}</span>}
                    </span>
                  </th>
                ))}
                {editable && <th className="no-print w-24" />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={span} className="py-8 text-center text-ink-mute">{q ? "No rows match your search." : "No rows yet."}</td></tr>}
              {rows.map((r, i) => {
                const g = groupBy?.(r) ?? null;
                const header = groupBy && g !== lastGroup ? g : null;
                lastGroup = g;
                const isSel = selected.has(r.id);
                const groupIds = header !== null ? rows.filter((x) => groupBy!(x) === g).map((x) => x.id) : [];
                return [
                  header !== null && (
                    <tr key={`g-${r.id}`}>
                      <td colSpan={span} className="bg-ink p-0">
                        <div className="sticky left-0 flex w-fit items-center gap-2 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
                          {editable && (
                            <input type="checkbox" title="Select this group" checked={groupIds.length > 0 && groupIds.every((id) => selected.has(id))}
                              onChange={(e) => setSelected((cur) => { const n = new Set(cur); groupIds.forEach((id) => (e.target.checked ? n.add(id) : n.delete(id))); return n; })} />
                          )}
                          {header || "—"} <span className="font-normal normal-case text-white/60">· {groupIds.length} rows</span>
                        </div>
                      </td>
                    </tr>
                  ),
                  <tr key={r.id} className={cx("group", isSel && "bg-cue-soft/60")}>
                    {editable && (
                      <td className={cx("no-print sticky left-0 z-10", isSel ? "bg-cue-soft" : "bg-white")} style={{ width: SEL_W }}>
                        <input type="checkbox" aria-label="Select row" checked={isSel} onChange={() => toggle(r.id)} />
                      </td>
                    )}
                    <td className={cx("sticky z-10 text-xs text-ink-mute", isSel ? "bg-cue-soft" : "bg-white")} style={{ left: editable ? SEL_W : 0 }}>{i + 1}</td>
                    {visible.map((c) => (
                      <td key={c.key} className={cx("p-0.5", c.key === firstKey && cx("sticky z-10 shadow-[1px_0_0_#e6e1d7]", isSel ? "bg-cue-soft" : "bg-white"))}
                        style={c.key === firstKey ? { left: stickyLeft(c.key) } : undefined}>
                        {c.render ? <div className="px-1.5 py-1">{c.render(r)}</div> : (
                          <Cell col={c} value={(r as Record<string, unknown>)[c.key]} editable={editable}
                            onSave={(v) => api.update(r.id, { [c.key]: v } as Partial<T>)} />
                        )}
                      </td>
                    ))}
                    {editable && (
                      <td className="no-print whitespace-nowrap p-0.5 text-right opacity-60 group-hover:opacity-100">
                        <button className="btn btn-ghost btn-sm px-1" title="Move up" onClick={() => move(r, -1)}>↑</button>
                        <button className="btn btn-ghost btn-sm px-1" title="Move down" onClick={() => move(r, 1)}>↓</button>
                        <button className="btn btn-ghost btn-sm px-1" title="Insert row below" onClick={() => addAfter(r)}>＋</button>
                        <ConfirmButton onConfirm={() => api.remove(r.id)} label="Delete?">✕</ConfirmButton>
                      </td>
                    )}
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
      {paste && <PasteModal columns={columns.filter((c) => !c.render)} onClose={() => setPaste(false)} onImport={async (records) => {
        const start = allRows.length ? Math.max(...allRows.map((r) => Number(r.sort_order ?? 0))) + 1 : 0;
        await api.insertMany(records.map((rec, i) => ({ ...newRow(), ...rec, ...(orderKey === "sort_order" ? { sort_order: start + i } : {}) } as Partial<T>)));
        setPaste(false);
      }} />}
    </div>
  );
}

function Cell<T>({ col, value, editable, onSave }: { col: GridColumn<T>; value: unknown; editable: boolean; onSave: (v: unknown) => void }) {
  const str = value === null || value === undefined ? "" : String(value);
  const [v, setV] = useState(str);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setV(str), [str]);
  useEffect(() => {
    if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = `${ref.current.scrollHeight}px`; }
  }, [v]);

  const commit = (nv: string) => {
    if (nv === str) return;
    if (col.type === "number") onSave(nv === "" ? null : Number(nv));
    else onSave(nv === "" ? null : nv);
  };

  if (col.type === "checkbox") {
    return <input type="checkbox" className="m-2" disabled={!editable} checked={!!value} onChange={(e) => onSave(e.target.checked)} />;
  }
  if (!editable) {
    const label = col.options?.find((o) => o.value === str)?.label ?? str;
    return <div className="whitespace-pre-wrap px-1.5 py-1">{label}<LinkChips text={str} className="mt-1" /></div>;
  }
  if (col.type === "select") {
    return (
      <select className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm hover:border-paper-line focus:border-cue focus:outline-none" value={str} onChange={(e) => onSave(e.target.value || null)}>
        <option value="">—</option>
        {col.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (col.type === "date" || col.type === "number") {
    return <input type={col.type} className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-paper-line focus:border-cue focus:bg-white focus:outline-none" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => commit(v)} />;
  }
  return (
    <div>
      <textarea
        ref={ref}
        rows={1}
        className={cx("block w-full resize-none overflow-hidden rounded border border-transparent bg-transparent px-1.5 py-1 text-sm leading-snug hover:border-paper-line focus:border-cue focus:bg-white focus:outline-none")}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => commit(v)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && col.type !== "multiline") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
      />
      <LinkChips text={v} className="px-1.5 pb-1" />
    </div>
  );
}

/** Parse clipboard TSV (handles quoted multi-line cells from Excel / Google Sheets). */
export function parseTSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === "\t") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function PasteModal<T>({ columns, onClose, onImport }: {
  columns: GridColumn<T>[]; onClose: () => void; onImport: (records: Record<string, unknown>[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [map, setMap] = useState<string[]>(columns.map((c) => c.key));
  const [skipHeader, setSkipHeader] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const data = parseTSV(text);
  const width = Math.max(0, ...data.map((r) => r.length));
  const body = skipHeader ? data.slice(1) : data;

  async function go() {
    try {
      await onImport(body.map((r) => {
        const rec: Record<string, unknown> = {};
        r.forEach((cell, i) => {
          const k = map[i];
          if (!k || cell.trim() === "") return;
          const col = columns.find((c) => c.key === k);
          rec[k] = col?.type === "number" ? Number(cell) || null : cell.trim();
        });
        return rec;
      }));
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <Modal open onClose={onClose} title="Paste rows from a spreadsheet" wide>
      <p className="mb-2 text-sm text-ink-mute">Copy cells in Excel or Google Sheets, paste here, then match each pasted column to a field.</p>
      <textarea className="input h-36 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste here…" />
      {width > 0 && (
        <>
          <label className="mt-2 flex items-center gap-1.5 text-xs"><input type="checkbox" checked={skipHeader} onChange={(e) => setSkipHeader(e.target.checked)} /> First row is a header</label>
          <div className="mt-2 overflow-x-auto">
            <table className="table-sm">
              <thead>
                <tr>{Array.from({ length: width }).map((_, i) => (
                  <th key={i}>
                    <select className="input py-0.5 text-xs normal-case" value={map[i] ?? ""} onChange={(e) => { const m = [...map]; m[i] = e.target.value; setMap(m); }}>
                      <option value="">(skip)</option>
                      {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {body.slice(0, 5).map((r, i) => <tr key={i}>{Array.from({ length: width }).map((_, j) => <td key={j} className="max-w-[160px] truncate text-xs">{r[j]}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-ink-mute">{body.length} rows</p>
        </>
      )}
      <ErrorNote msg={err} />
      <button className="btn btn-primary mt-3 w-full" disabled={!body.length} onClick={go}>Import {body.length} rows</button>
    </Modal>
  );
}
