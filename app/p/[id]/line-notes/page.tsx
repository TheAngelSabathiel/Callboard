"use client";
import { useMemo, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { Field, PageHeader } from "@/components/ui";
import { QuickCapture } from "@/components/live/QuickCapture";
import { EditableGrid, type GridColumn } from "@/components/EditableGrid";
import { ExportMenu } from "@/components/export/ExportMenu";
import { useRows } from "@/lib/useRows";
import type { LineNote } from "@/lib/types";
import { fmtDate, todayISO } from "@/lib/utils";

const ISSUES = ["Dropped line", "Paraphrased", "Wrong word", "Added words", "Jumped cue", "Called for line", "Out of order", "Late entrance"];

export default function LineNotesPage() {
  const { production, canEdit, characters, members, charactersAZ } = useProduction();
  const notes = useRows<LineNote>("line_notes", production.id, { order: [{ column: "date", ascending: false }, { column: "sort_order" }] });
  const [date, setDate] = useState(todayISO());
  const [who, setWho] = useState("");
  const rows = useMemo(() => notes.rows.filter((n) => (!date || n.date === date) && (!who || n.character === who)), [notes.rows, date, who]);
  const dates = Array.from(new Set(notes.rows.map((n) => n.date))).sort().reverse();

  const columns: GridColumn<LineNote>[] = [
    { key: "character", label: "Character", width: 150, type: "select", options: charactersAZ.map((c) => ({ value: c.name, label: c.name })) },
    { key: "page", label: "Pg", width: 60 },
    { key: "line", label: "Line as written", width: 320, type: "multiline" },
    { key: "issue", label: "Issue", width: 140, type: "select", options: ISSUES.map((i) => ({ value: i, label: i })) },
    { key: "note", label: "What was said / note", width: 280, type: "multiline" },
    { key: "sent", label: "Given", width: 60, type: "checkbox" },
  ];

  const byActor = useMemo(() => {
    const m = new Map<string, LineNote[]>();
    rows.forEach((n) => m.set(n.character ?? "—", [...(m.get(n.character ?? "—") ?? []), n]));
    return m;
  }, [rows]);

  function mailto(character: string, list: LineNote[]) {
    const c = characters.rows.find((x) => x.name === character);
    const email = members.rows.find((m) => m.id === c?.actor_id)?.email ?? "";
    const body = list.map((n) => `pg. ${n.page ?? "?"} · ${n.issue ?? ""}\nScript: ${n.line ?? ""}\nSaid: ${n.note ?? ""}`).join("\n\n");
    return `mailto:${email}?subject=${encodeURIComponent(`Line notes · ${character} · ${fmtDate(date)}`)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <>
      <PageHeader help="linenotes" title="Line Notes" subtitle="Log text errors during runs, then send each actor their notes."
        actions={<ExportMenu kind="linenotes" params={date ? { date } : {}} />} />
      <div className="no-print mb-3 flex flex-wrap items-end gap-2">
        <Field label="Date">
          <div className="flex gap-1">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="btn btn-sm" onClick={() => setDate("")}>All</button>
          </div>
        </Field>
        <Field label="Character">
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {charactersAZ.map((c) => <option key={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {dates.length > 0 && <p className="text-xs text-ink-mute">Dates with notes: {dates.slice(0, 8).map((d) => <button key={d} className="mr-1 underline" onClick={() => setDate(d)}>{fmtDate(d, { month: "short", day: "numeric" })}</button>)}</p>}
      </div>
      {canEdit && (
        <div className="no-print card mb-4 p-3">
          <p className="mb-2 text-sm font-bold">Quick entry <span className="font-normal text-ink-mute">· character → issue → page → what was said → Enter</span></p>
          <QuickCapture modes={["line"]} compact date={date || todayISO()} onSaved={() => setTimeout(() => notes.reload(), 400)} />
        </div>
      )}
      <EditableGrid<LineNote> api={notes} rows={rows} columns={columns} editable={canEdit} minWidth={1000}
        newRow={() => ({ production_id: production.id, date: date || todayISO(), character: who || null, sent: false })} />
      {byActor.size > 0 && (
        <div className="no-print mt-4 card p-4">
          <p className="mb-2 font-semibold">Send to actors</p>
          <div className="flex flex-wrap gap-2">
            {Array.from(byActor.entries()).map(([c, list]) => (
              <a key={c} className="btn btn-sm" href={mailto(c, list)}>{c} · {list.length} ✉</a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
