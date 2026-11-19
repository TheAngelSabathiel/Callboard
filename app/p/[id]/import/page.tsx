"use client";
import Link from "next/link";
import { useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { ErrorNote, Field, PageHeader } from "@/components/ui";
import {
  type Grid, type SheetKind, detectSheet, parseAvailability, parseBreakdown, parseDirectory,
  parseMeetingText, parseScheduleText, parseTabularCalendar, worksheetToGrid,
} from "@/lib/importers";
import { applyAvailability, applyBreakdown, applyCalendar, applyDirectory, applyMeeting } from "@/lib/importApply";
import { cx, todayISO } from "@/lib/utils";

type Sheet = { name: string; grid: Grid; kind: SheetKind };

const KIND_LABEL: Record<SheetKind, string> = {
  directory: "Directory → Company & Cast",
  calendar: "Tabular calendar → Calendar",
  availability: "Availability grid → Availability",
  breakdown: "Sequence / scene breakdown → Breakdown",
  skip: "Skip",
};
const ORDER: SheetKind[] = ["directory", "availability", "calendar", "breakdown"];

export default function ImportPage() {
  const { production, canEdit, members, characters } = useProduction();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [fileName, setFileName] = useState("");
  const defaultYear = Number((production.first_rehearsal ?? todayISO()).slice(0, 4));
  const [year, setYear] = useState(defaultYear);
  const [skipDates, setSkipDates] = useState(true);
  const [replaceBreakdown, setReplaceBreakdown] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const push = (m: string) => setLog((l) => [...l, m]);

  if (!canEdit) return <><PageHeader help="import" title="Import files" /><p className="text-sm text-ink-mute">Only the SM team can import.</p></>;

  async function onWorkbook(f: File) {
    setErr(null); setLog([]); setFileName(f.name);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const list: Sheet[] = [];
      const seen = new Set<SheetKind>();
      wb.worksheets.forEach((ws) => {
        const grid = worksheetToGrid(ws as never);
        let kind = detectSheet(ws.name, grid);
        // only one breakdown sheet by default: prefer the most recently updated / "upd" one
        if (kind === "breakdown" && seen.has("breakdown") && !/upd|latest|final/i.test(ws.name)) kind = "skip";
        if (kind === "breakdown" && /upd|latest|final/i.test(ws.name)) list.forEach((s) => s.kind === "breakdown" && (s.kind = "skip"));
        seen.add(kind);
        list.push({ name: ws.name, grid, kind });
      });
      setSheets(list);
    } catch (e) { setErr(`Could not read workbook: ${(e as Error).message}`); }
  }

  function summary(s: Sheet) {
    try {
      if (s.kind === "directory") { const d = parseDirectory(s.grid); return `${d.people.length} people, ${d.cast.length} characters`; }
      if (s.kind === "calendar") { const e = parseTabularCalendar(s.grid); return `${e.length} days, ${e.reduce((n, x) => n + x.blocks.length, 0)} agenda blocks`; }
      if (s.kind === "availability") { const a = parseAvailability(s.grid, year); const ds = a.entries.map((x) => x.date).sort(); return `${a.people.length} people, ${a.entries.length} marks${ds.length ? ` (${ds[0]} → ${ds[ds.length - 1]})` : ""}`; }
      if (s.kind === "breakdown") return `${parseBreakdown(s.grid).length} rows`;
    } catch (e) { return `Error: ${(e as Error).message}`; }
    return "";
  }

  async function runWorkbook() {
    setBusy(true); setErr(null); setLog([]);
    let firstBreakdownDone = false;
    try {
      for (const kind of ORDER) {
        for (const s of sheets.filter((x) => x.kind === kind)) {
          push(`▸ ${s.name}`);
          if (kind === "directory") await applyDirectory(production.id, parseDirectory(s.grid), push);
          if (kind === "availability") await applyAvailability(production.id, parseAvailability(s.grid, year), push);
          if (kind === "calendar") await applyCalendar(production.id, parseTabularCalendar(s.grid), { skipExistingDates: skipDates, venueDefault: production.rehearsal_venue ?? undefined }, push);
          if (kind === "breakdown") await applyBreakdown(production.id, parseBreakdown(s.grid), push, replaceBreakdown && !firstBreakdownDone);
          if (kind === "breakdown") firstBreakdownDone = true;
        }
      }
      push("✓ Done. Open Company & Cast, Calendar, Availability and Breakdown to review.");
      await Promise.all([members.reload(), characters.reload()]);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <>
      <PageHeader help="import" title="Import files" subtitle="Bring in the paperwork you already have so you can continue here. Imports add to what's already in this production; nothing is deleted." />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {/* Excel */}
          <div className="card p-4">
            <p className="font-semibold">1 · SM paperwork workbook (.xlsx)</p>
            <p className="mb-3 text-sm text-ink-mute">Recognizes Directory, Tabular Calendar, Prod &amp; Actors Schedule (availability) and Sequence / Actors Breakdown sheets. Check the type of each sheet before importing.</p>
            <input type="file" accept=".xlsx" className="input" onChange={(e) => e.target.files?.[0] && onWorkbook(e.target.files[0])} />
            {sheets.length > 0 && (
              <>
                <p className="mt-3 text-xs text-ink-mute">{fileName}</p>
                <div className="mt-2 divide-y divide-paper-line rounded-md border border-paper-line">
                  {sheets.map((s, i) => (
                    <div key={s.name} className="grid items-center gap-2 p-2 sm:grid-cols-[1fr_260px]">
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-ink-mute">{s.kind === "skip" ? "Will not be imported" : summary(s)}</p>
                      </div>
                      <select className="input" value={s.kind} onChange={(e) => setSheets(sheets.map((x, j) => (j === i ? { ...x, kind: e.target.value as SheetKind } : x)))}>
                        {(Object.keys(KIND_LABEL) as SheetKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  {sheets.some((s) => s.kind === "availability") && (
                    <Field label="Year of the first month in the availability grid">
                      <input className="input w-28" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
                    </Field>
                  )}
                  {sheets.some((s) => s.kind === "breakdown") && (
                    <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={replaceBreakdown} onChange={(e) => setReplaceBreakdown(e.target.checked)} /> Replace the current Scene Breakdown (avoids duplicate rows)</label>
                  )}
                  {sheets.some((s) => s.kind === "calendar") && (
                    <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={skipDates} onChange={(e) => setSkipDates(e.target.checked)} /> Skip dates that already have calendar items</label>
                  )}
                </div>
                {sheets.filter((s) => s.kind === "breakdown").length > 1 && (
                  <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-stby">
                    {sheets.filter((s) => s.kind === "breakdown").length} breakdown sheets are selected ({sheets.filter((s) => s.kind === "breakdown").map((s) => s.name).join(", ")}). They're usually old and updated versions of the same breakdown, so importing both duplicates every scene. Set all but one to <b>Skip</b>.
                  </p>
                )}
                <button className="btn btn-primary mt-3" disabled={busy || !sheets.some((s) => s.kind !== "skip")} onClick={runWorkbook}>{busy ? "Importing…" : "Import selected sheets"}</button>
                <p className="mt-2 text-xs text-ink-mute">Order: directory first (so “Called” names match characters), then availability, calendar, breakdown. Month-grid calendar sheets are skipped; the tabular calendar carries the same data.</p>
              </>
            )}
          </div>

          <MeetingImport onLog={push} />
          <ScheduleTextImport onLog={push} />

          <div className="card p-4 text-sm">
            <p className="font-semibold">Other files</p>
            <ul className="mt-1 list-disc pl-5 text-ink-soft">
              <li>Scripts (.docx / .txt): <Link className="underline" href={`/p/${production.id}/script`}>Script &amp; Blocking → Import</Link></li>
              <li>Any table (props list, cue sheet, directory rows): copy the cells in Excel or Google Sheets and use <b>Paste from Excel / Sheets</b> on that page</li>
            </ul>
          </div>
        </div>

        <div className="card h-fit p-4 xl:sticky xl:top-6">
          <p className="font-semibold">Import log</p>
          <ErrorNote msg={err} />
          {log.length === 0 ? <p className="text-sm text-ink-mute">Nothing imported yet.</p> : (
            <ul className="mt-2 space-y-1 text-xs">{log.map((l, i) => <li key={i} className={cx(l.startsWith("✓") && "font-semibold text-go", l.startsWith("▸") && "font-semibold")}>{l}</li>)}</ul>
          )}
        </div>
      </div>
    </>
  );
}

function MeetingImport({ onLog }: { onLog: (m: string) => void }) {
  const { production } = useProduction();
  const [files, setFiles] = useState<{ name: string; text: string; date: string; schedule: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFiles(list: FileList) {
    setErr(null);
    const mammoth = await import("mammoth");
    const out: typeof files = [];
    for (const f of Array.from(list)) {
      try {
        const text = f.name.toLowerCase().endsWith(".docx") ? (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value : await f.text();
        const plan = parseMeetingText(text);
        out.push({ name: f.name, text, date: todayISO(), schedule: /(\d{1,2}(:\d{2})?\s*(am|pm))/i.test(plan.notes) });
      } catch (e) { setErr(`${f.name}: ${(e as Error).message}`); }
    }
    setFiles(out);
  }

  async function run() {
    setBusy(true); setErr(null);
    try {
      for (const f of files) {
        onLog(`▸ ${f.name}`);
        const plan = parseMeetingText(f.text);
        await applyMeeting(production.id, plan, f.date, onLog);
        if (f.schedule) {
          const events = parseScheduleText(plan.notes, Number(f.date.slice(0, 4)));
          if (events.length) await applyCalendar(production.id, events, { skipExistingDates: true, venueDefault: production.rehearsal_venue ?? undefined }, onLog);
        }
      }
      onLog("✓ Meeting reports imported. See Reports.");
      setFiles([]);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="card p-4">
      <p className="font-semibold">2 · Meeting / SM reports (.docx)</p>
      <p className="mb-3 text-sm text-ink-mute">Reads Present, General Meeting Notes, Schedules Given/Received, Next Rehearsal Date and Prepared by. A schedule written in the notes (“DEC 2- ACT 2 … 6:00 PM-7:30PM: UNIT 30”) can also become calendar items.</p>
      <input type="file" accept=".docx,.txt" multiple className="input" onChange={(e) => e.target.files && onFiles(e.target.files)} />
      {files.map((f, i) => {
        const p = parseMeetingText(f.text);
        const ev = parseScheduleText(p.notes, Number(f.date.slice(0, 4)));
        return (
          <div key={f.name} className="mt-3 rounded-md border border-paper-line p-3 text-sm">
            <p className="font-medium">{f.name}</p>
            <p className="text-xs text-ink-mute">Present: {p.present.join(", ") || "—"} · Prepared by: {p.preparedBy || "—"}</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <Field label="Meeting date"><input className="input" type="date" value={f.date} onChange={(e) => setFiles(files.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} /></Field>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={f.schedule} onChange={(e) => setFiles(files.map((x, j) => (j === i ? { ...x, schedule: e.target.checked } : x)))} />
                Also create {ev.length} calendar day{ev.length === 1 ? "" : "s"} from the schedule in the notes{ev.length ? ` (${ev[0].date} → ${ev[ev.length - 1].date})` : ""}
              </label>
            </div>
          </div>
        );
      })}
      <ErrorNote msg={err} />
      {files.length > 0 && <button className="btn btn-primary mt-3" disabled={busy} onClick={run}>{busy ? "Importing…" : `Import ${files.length} report${files.length > 1 ? "s" : ""}`}</button>}
    </div>
  );
}

function ScheduleTextImport({ onLog }: { onLog: (m: string) => void }) {
  const { production } = useProduction();
  const [text, setText] = useState("");
  const [year, setYear] = useState(Number(todayISO().slice(0, 4)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const events = text.trim() ? parseScheduleText(text, year) : [];
  return (
    <div className="card p-4">
      <p className="font-semibold">3 · Paste a schedule</p>
      <p className="mb-2 text-sm text-ink-mute">From a group chat or document. One date per line, then the called list (optional) and time lines.</p>
      <textarea className="input h-36 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"DEC 2- ACT 2\nPepang, Manolo, Candido, Pablito, Perico\n- 6:00 PM-7:30PM: UNIT 30, 31, 32, 33\n- 7:30 PM- 8:00PM: DINNER\n- 8:00 PM- 10:00PM: UNIT 36, 37, 39, 40"} />
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <Field label="Year"><input className="input w-28" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field>
        <p className="text-xs text-ink-mute">{events.length ? `${events.length} days found: ${events.map((e) => `${e.date} (${e.blocks.length})`).join(", ")}` : ""}</p>
      </div>
      <ErrorNote msg={err} />
      <button className="btn btn-primary mt-2" disabled={!events.length || busy} onClick={async () => {
        setBusy(true); setErr(null);
        try { await applyCalendar(production.id, events, { skipExistingDates: false, venueDefault: production.rehearsal_venue ?? undefined }, onLog); setText(""); }
        catch (e) { setErr((e as Error).message); }
        setBusy(false);
      }}>Create calendar items</button>
    </div>
  );
}
