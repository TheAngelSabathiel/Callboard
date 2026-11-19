"use client";
import { useEffect, useRef, useState } from "react";
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
  insert: (row: Partial<T>) => Promise<T>;
  insertMany: (rows: Partial<T>[]) => Promise<T[]>;
  error: string | null;
};

/**
 * Spreadsheet-like table for production lists (breakdown, cues, props, line notes).
 * Cells save on blur. Rows can be added, deleted, reordered and pasted from Excel/Sheets.
 */
export function EditableGrid<T extends { id: string; sort_order?: number }>({
  api, columns, editable, newRow, rows: rowsOverride, groupBy, minWidth = 900, orderKey = "sort_order",
}: {
  api: Api<T>; columns: GridColumn<T>[]; editable: boolean; newRow: () => Partial<T>;
  rows?: T[]; groupBy?: (r: T) => string; minWidth?: number; orderKey?: keyof T & string;
}) {
  const rows = rowsOverride ?? api.rows;
  const [paste, setPaste] = useState(false);

  async function move(row: T, dir: -1 | 1) {
    const i = rows.findIndex((r) => r.id === row.id);
    const other = rows[i + dir];
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
      const idx = row ? Number(row.sort_order ?? 0) + 1 : (rows.length ? Math.max(...rows.map((r) => Number(r.sort_order ?? 0))) + 1 : 0);
      if (row) {
        // shift following rows down to make room
        const later = rows.filter((r) => Number(r.sort_order ?? 0) >= idx);
        await Promise.all(later.map((r) => api.update(r.id, { sort_order: Number(r.sort_order ?? 0) + 1 } as Partial<T>)));
      }
      await api.insert({ ...base, sort_order: idx } as Partial<T>);
    } else await api.insert(base);
  }

  let lastGroup: string | null = null;

  return (
    <div className="space-y-2">
      <ErrorNote msg={api.error} />
      {editable && (
        <div className="no-print flex flex-wrap gap-2">
          <button className="btn btn-primary btn-sm" onClick={() => addAfter()}>+ Row</button>
          <button className="btn btn-sm" onClick={() => setPaste(true)}>Paste from Excel / Sheets</button>
        </div>
      )}
      <div className="card overflow-auto">
        <table className="table-sm" style={{ minWidth }}>
          <thead>
            <tr>
              <th className="w-8">#</th>
              {columns.map((c) => <th key={c.key} style={{ width: c.width, minWidth: c.width }}>{c.label}</th>)}
              {editable && <th className="no-print w-24" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={columns.length + 2} className="py-8 text-center text-ink-mute">No rows yet.</td></tr>}
            {rows.map((r, i) => {
              const g = groupBy?.(r) ?? null;
              const header = groupBy && g !== lastGroup ? g : null;
              lastGroup = g;
              return [
                header !== null && (
                  <tr key={`g-${r.id}`}><td colSpan={columns.length + 2} className="bg-ink px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">{header || "—"}</td></tr>
                ),
                <tr key={r.id} className="group">
                  <td className="text-xs text-ink-mute">{i + 1}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="p-0.5">
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
      {paste && <PasteModal columns={columns.filter((c) => !c.render)} onClose={() => setPaste(false)} onImport={async (records) => {
        const start = rows.length ? Math.max(...rows.map((r) => Number(r.sort_order ?? 0))) + 1 : 0;
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
    return <div className="whitespace-pre-wrap px-1.5 py-1">{label}</div>;
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
    <textarea
      ref={ref}
      rows={1}
      className={cx("block w-full resize-none overflow-hidden rounded border border-transparent bg-transparent px-1.5 py-1 text-sm leading-snug hover:border-paper-line focus:border-cue focus:bg-white focus:outline-none")}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => commit(v)}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && col.type !== "multiline") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
    />
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
