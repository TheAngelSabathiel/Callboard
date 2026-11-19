"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProduction } from "@/components/production/ProductionProvider";
import { Field, PageHeader } from "@/components/ui";
import { QuickCapture, type QuickCaptureHandle } from "@/components/live/QuickCapture";
import { useSchedule } from "@/lib/useSchedule";
import { useRows } from "@/lib/useRows";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ensureReport, nowHHMM } from "@/lib/capture";
import { notify } from "@/lib/notify";
import { ATTENDANCE } from "@/lib/reports";
import { calledMembers, calledText, castLabel, typeMeta } from "@/lib/schedule";
import type { Attendance, AttendanceStatus, Member, Report, ReportSection } from "@/lib/types";
import { cx, fmtDate, fmtRange, fmtTime, todayISO, toMin } from "@/lib/utils";

const CYCLE: AttendanceStatus[] = ["present", "late", "absent", "excused"];

export default function LivePageWrapper() {
  return <Suspense><LivePage /></Suspense>;
}

function LivePage() {
  const search = useSearchParams();
  const { production, members, characters, canEdit } = useProduction();
  const s = useSchedule(production.id);
  const [date, setDate] = useState(() => search.get("date") || todayISO());
  const [now, setNow] = useState(() => nowHHMM());
  const [reportId, setReportId] = useState<string | null>(null);
  const capture = useRef<QuickCaptureHandle>(null);
  const base = `/p/${production.id}`;

  useEffect(() => { const t = setInterval(() => setNow(nowHHMM()), 15_000); return () => clearInterval(t); }, []);

  // existing report for the date (don't create until something is saved)
  useEffect(() => {
    setReportId(null);
    supabaseBrowser().from("reports").select("id").eq("production_id", production.id).eq("date", date).neq("type", "meeting").order("created_at").limit(1)
      .then(({ data }: { data: { id: string }[] | null }) => setReportId(data?.[0]?.id ?? null));
  }, [date, production.id]);

  // N focuses the note box
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); capture.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const events = s.byDate.get(date) ?? [];
  const blocks = events.flatMap((e) => s.blocksByEvent.get(e.id) ?? []);
  const isToday = date === todayISO();
  const nm = toMin(now) ?? 0;
  const current = isToday ? blocks.find((b) => (toMin(b.start_time) ?? -1) <= nm && nm < (toMin(b.end_time) ?? 9999)) : undefined;
  const next = isToday ? blocks.find((b) => (toMin(b.start_time) ?? -1) > nm) : blocks[0];
  const nextDate = useMemo(() => Array.from(s.byDate.keys()).sort().find((d) => d > todayISO()), [s.byDate]);

  const calledToday = useMemo(() => {
    const ids = new Set<string>();
    blocks.forEach((b) => calledMembers(b, members.rows).forEach((m) => ids.add(m.id)));
    return members.rows.filter((m) => ids.has(m.id));
  }, [blocks, members.rows]);

  const ensure = async () => {
    if (reportId) return reportId;
    const id = await ensureReport(production.id, date);
    setReportId(id);
    return id;
  };

  return (
    <>
      <PageHeader
        help="live"
        title="Rehearsal Mode"
        subtitle={`${fmtDate(date, { weekday: "long", month: "long", day: "numeric" })}${events.length ? ` · ${events.map((e) => e.title).join(" / ")}` : ""}`}
        actions={
          <>
            <input className="input w-40" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            {reportId && <Link className="btn" href={`${base}/reports/${reportId}`}>Open report</Link>}
            <Link className="btn" href={`${base}/script`}>Open script</Link>
          </>
        }
      />

      {!events.length && (
        <div className="card mb-4 p-3 text-sm">
          Nothing on the calendar for this date. You can still log notes; they go into this date&apos;s report.
          {nextDate && <> Next call: <button className="underline" onClick={() => setDate(nextDate)}>{fmtDate(nextDate, { weekday: "short", month: "short", day: "numeric" })}</button></>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* Capture */}
          <div className="card border-2 border-cue/40 p-4">
            <p className="mb-2 text-sm font-bold">Log it now <span className="font-normal text-ink-mute">· press N to jump here</span></p>
            <QuickCapture ref={capture} date={date} onSaved={() => { if (!reportId) ensure().catch(() => {}); }} />
          </div>

          {/* Now / next */}
          {events.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <BlockCard label={isToday ? "Now" : "First block"} block={current ?? (isToday ? undefined : blocks[0])} now={isToday ? nm : null} />
              <BlockCard label="Next" block={isToday ? next : blocks[1]} now={null} />
            </div>
          )}

          <TodayNotes reportId={reportId} base={base} />
        </div>

        <div className="space-y-4">
          {canEdit && <RehearsalClock date={date} ensure={ensure} reportId={reportId} />}
          <AttendanceQuick people={calledToday} reportId={reportId} ensure={ensure} />
          {blocks.length > 0 && (
            <div className="card p-3">
              <p className="mb-2 text-sm font-bold">Today&apos;s agenda</p>
              <ul className="space-y-1.5 text-sm">
                {blocks.map((b) => (
                  <li key={b.id} className={cx("rounded px-2 py-1", current?.id === b.id && "bg-cue-soft ring-1 ring-cue")}>
                    <span className="text-xs text-ink-mute">{fmtRange(b.start_time, b.end_time)}</span>
                    <p className="font-medium">{b.agenda}{b.scenes ? <span className="font-normal text-ink-mute"> · {b.scenes}</span> : null}</p>
                    <p className="text-xs text-ink-mute">{calledText(b, members.rows, characters.rows)}</p>
                  </li>
                ))}
              </ul>
              {events[0] && <Link href={`${base}/calendar/${events[0].id}`} className="mt-2 inline-block text-xs underline">Edit agenda</Link>}
            </div>
          )}
        </div>
      </div>
    </>
  );

  function BlockCard({ label, block, now: n }: { label: string; block?: (typeof blocks)[number]; now: number | null }) {
    const left = block && n !== null ? (toMin(block.end_time) ?? 0) - n : null;
    const ev = block ? events.find((e) => e.id === block.event_id) : undefined;
    return (
      <div className={cx("card p-3", label === "Now" && block && "border-cue")}>
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-mute">{label}</p>
        {block ? (
          <>
            <p className="text-lg font-bold leading-tight">{block.agenda}</p>
            <p className="text-xs text-ink-mute">{fmtRange(block.start_time, block.end_time)}{block.scenes ? ` · ${block.scenes}` : ""}{ev ? ` · ${typeMeta(ev.type).label}` : ""}</p>
            <p className="mt-1 text-xs">{calledText(block, members.rows, characters.rows) || "—"}</p>
            {left !== null && left >= 0 && <p className={cx("mt-1 text-sm font-semibold", left <= 5 ? "text-red-700" : "text-go")}>{left} min left</p>}
          </>
        ) : <p className="text-sm text-ink-mute">{label === "Now" ? "No block right now." : "Nothing after this."}</p>}
      </div>
    );
  }
}

function TodayNotes({ reportId, base }: { reportId: string | null; base: string }) {
  const sections = useRows<ReportSection>("report_sections", reportId, { column: "report_id", order: [{ column: "sort_order" }], enabled: !!reportId, notify: false });
  const filled = sections.rows.filter((x) => x.body.trim());
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold">Today&apos;s report so far</p>
        {reportId && <Link className="text-xs underline" href={`${base}/reports/${reportId}`}>Edit full report</Link>}
      </div>
      {!reportId || filled.length === 0 ? <p className="text-sm text-ink-mute">Nothing logged yet. Notes you save above appear here, sorted by department.</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filled.map((x) => (
            <div key={x.id} className={cx("rounded-md bg-paper p-2", x.needs_attention && "ring-1 ring-cue")}>
              <p className="text-xs font-bold">{x.title}{x.needs_attention ? " ⚑" : ""}</p>
              <p className="whitespace-pre-wrap text-xs">{x.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RehearsalClock({ date, ensure, reportId }: { date: string; ensure: () => Promise<string>; reportId: string | null }) {
  const { production } = useProduction();
  const reports = useRows<Report>("reports", production.id, { notify: false });
  const r = reports.rows.find((x) => x.id === reportId);
  const t = r?.timings ?? {};
  const key = `cb-break-${production.id}-${date}`;
  const [breakEnd, setBreakEnd] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => { try { const v = localStorage.getItem(key); setBreakEnd(v ? Number(v) : null); } catch { /* ignore */ } }, [key]);
  useEffect(() => { if (!breakEnd) return; const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i); }, [breakEnd]);

  async function stamp(patch: Record<string, string>, msg: string) {
    try {
      const id = await ensure();
      const { data } = await supabaseBrowser().from("reports").select("timings").eq("id", id).single();
      const timings = { ...((data as { timings: Record<string, string> } | null)?.timings ?? {}), ...patch };
      const { error } = await supabaseBrowser().from("reports").update({ timings }).eq("id", id);
      if (error) throw error;
      await reports.reload();
      notify.info(msg, fmtTime(Object.values(patch)[0]));
    } catch (e) { notify.error((e as Error).message); }
  }

  function startBreak(min: number) {
    const end = Date.now() + min * 60_000;
    setBreakEnd(end);
    try { localStorage.setItem(key, String(end)); } catch { /* ignore */ }
    stamp({ break_start: nowHHMM() }, `${min}-minute break started`);
  }
  function resume() {
    setBreakEnd(null);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    stamp({ break_end: nowHHMM() }, "Back from break");
  }

  const remaining = breakEnd ? Math.round((breakEnd - Date.now()) / 1000) : null;
  const mm = remaining !== null ? `${remaining < 0 ? "-" : ""}${Math.floor(Math.abs(remaining) / 60)}:${String(Math.abs(remaining) % 60).padStart(2, "0")}` : "";

  return (
    <div className="card p-3">
      <p className="mb-2 text-sm font-bold">Rehearsal clock</p>
      {remaining !== null && (
        <div className={cx("mb-2 rounded-md p-2 text-center", remaining <= 0 ? "bg-red-600 text-white" : remaining <= 60 ? "bg-amber-100" : "bg-paper")}>
          <p className="text-[11px] font-semibold uppercase">{remaining <= 0 ? "Break is over" : "Break"}</p>
          <p className="font-mono text-3xl font-bold">{mm}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-primary" onClick={() => stamp({ start: nowHHMM() }, "Rehearsal started")}>▶ Start</button>
        {remaining === null ? (
          <div className="flex gap-1">
            {[5, 10, 15].map((m) => <button key={m} className="btn flex-1 px-1" onClick={() => startBreak(m)}>{m}′</button>)}
          </div>
        ) : <button className="btn btn-cue" onClick={resume}>Resume</button>}
        <button className="btn col-span-2" onClick={() => stamp({ end: nowHHMM() }, "Rehearsal ended")}>■ End rehearsal</button>
      </div>
      <dl className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
        {[["Start", t.start], ["Break", t.break_start], ["Back", t.break_end], ["End", t.end]].map(([l, v]) => (
          <div key={l} className="rounded bg-paper p-1"><dt className="text-ink-mute">{l}</dt><dd className="font-semibold">{v ? fmtTime(v) : "—"}</dd></div>
        ))}
      </dl>
      <p className="mt-1 text-[11px] text-ink-mute">Times go into the report&apos;s Times section.</p>
    </div>
  );
}

function AttendanceQuick({ people, reportId, ensure }: { people: Member[]; reportId: string | null; ensure: () => Promise<string> }) {
  const { production, characters, canEdit } = useProduction();
  const att = useRows<Attendance>("attendance", reportId, { column: "report_id", enabled: !!reportId, notify: false });
  const [filter, setFilter] = useState("");

  async function tap(m: Member) {
    if (!canEdit) return;
    const id = await ensure().catch((e: Error) => { notify.error(e.message); return null; });
    if (!id) return;
    const cur = att.rows.find((a) => a.member_id === m.id);
    const next = cur ? CYCLE[(CYCLE.indexOf(cur.status) + 1) % CYCLE.length] : "present";
    const arrival = next === "late" ? nowHHMM() : cur?.arrival_time ?? null;
    try {
      await att.upsert([{ report_id: id, production_id: production.id, member_id: m.id, status: next, arrival_time: arrival }], "report_id,member_id");
      notify.saved(`${m.display_name}: ${ATTENDANCE.find((x) => x.value === next)?.label}`);
    } catch { /* toast shown by hook */ }
  }

  const shown = people.filter((m) => !filter || castLabel(m, characters.rows).toLowerCase().includes(filter.toLowerCase()));
  const here = att.rows.filter((a) => a.status === "present" || a.status === "late").length;

  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold">Attendance</p>
        <span className="text-xs text-ink-mute">{here}/{people.length} in</span>
      </div>
      {people.length > 8 && <input className="input mb-2 py-1 text-xs" placeholder="Find…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      {people.length === 0 ? <p className="text-xs text-ink-mute">No one is called on the calendar for this date.</p> : (
        <div className="grid grid-cols-1 gap-1">
          {shown.map((m) => {
            const a = att.rows.find((x) => x.member_id === m.id);
            const meta = ATTENDANCE.find((x) => x.value === a?.status);
            return (
              <button key={m.id} onClick={() => tap(m)}
                className={cx("flex items-center justify-between rounded-md border px-2 py-2 text-left text-sm active:scale-[0.99]", a ? "border-transparent" : "border-dashed border-paper-line bg-white", meta?.cls)}>
                <span className="truncate">{castLabel(m, characters.rows)}</span>
                <span className="ml-2 shrink-0 text-xs font-semibold">{meta ? `${meta.label}${a?.status === "late" && a.arrival_time ? ` ${fmtTime(a.arrival_time)}` : ""}` : "Tap when in"}</span>
              </button>
            );
          })}
        </div>
      )}
      <Field label="" className="mt-1"><span className="text-[11px] text-ink-mute">Tap: Present → Late (time stamped) → Absent → Excused</span></Field>
    </div>
  );
}
