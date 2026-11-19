"use client";
import Link from "next/link";
import { useProduction } from "@/components/production/ProductionProvider";
import { PageHeader } from "@/components/ui";
import { useRows } from "@/lib/useRows";
import type { LinkItem, Report, ReportSection, Task } from "@/lib/types";
import { reportLabel } from "@/lib/reports";
import { useSchedule } from "@/lib/useSchedule";
import { calledText, typeMeta } from "@/lib/schedule";
import { addDays, fmtDate, fmtRange, todayISO } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/roles";

export default function Overview() {
  const { production, me, members, characters } = useProduction();
  const base = `/p/${production.id}`;
  const tasks = useRows<Task>("tasks", production.id, { order: [{ column: "due_date" }] });
  const mine = tasks.rows.filter((t) => t.assignee_id === me?.id && t.status !== "done");
  const open = tasks.rows.filter((t) => t.status !== "done").length;
  const sched = useSchedule(production.id);
  const reports = useRows<Report>("reports", production.id, { order: [{ column: "date", ascending: false }] });
  const flagged = useRows<ReportSection>("report_sections", production.id, { realtime: false });
  const links = useRows<LinkItem>("links", production.id, { order: [{ column: "created_at", ascending: false }], notify: false });
  const pinnedLinks = links.rows.filter((l) => l.pinned).slice(0, 6);
  const followUps = flagged.rows.filter((s) => s.needs_attention && s.body.trim());
  const opening = production.opening_date;
  const daysToOpen = opening ? Math.round((new Date(opening + "T00:00:00").getTime() - new Date(todayISO() + "T00:00:00").getTime()) / 86400000) : null;
  const upcoming = sched.events.rows.filter((e) => e.date >= todayISO() && e.date <= addDays(todayISO(), 13));

  return (
    <>
      <PageHeader help="overview"
        title={production.title}
        subtitle={[production.produced_by && `Produced by ${production.produced_by}`, production.directed_by && `Directed by ${production.directed_by}`, production.show_dates].filter(Boolean).join(" · ")}
      />
      {(() => {
        const today = sched.events.rows.filter((e) => e.date === todayISO());
        return (
          <Link href={`${base}/live`} className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-ink p-4 text-white shadow-sm hover:bg-ink-soft">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cue">● Rehearsal Mode</p>
              <p className="mt-0.5 font-semibold">{today.length ? `Today: ${today.map((e) => e.title).join(" / ")}` : "No call today. Open it anyway to log notes."}</p>
              <p className="text-xs text-white/60">Notes, props, line notes, attendance and break timer on one screen. The report fills itself.</p>
            </div>
            <span className="text-2xl">→</span>
          </Link>
        );
      })()}

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label={daysToOpen !== null && daysToOpen >= 0 ? "Days to opening" : "Opening"} value={daysToOpen === null ? "Set in Settings" : daysToOpen >= 0 ? daysToOpen : "Running"} href={`${base}/settings`} />
        <Stat label="Company" value={members.rows.length} href={`${base}/company`} />
        <Stat label="Characters" value={characters.rows.length} href={`${base}/company`} />
        <Stat label="Open tasks" value={open} href={`${base}/tasks`} />
      </div>

      {pinnedLinks.length > 0 && (
        <div className="card mt-6 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">📌 Pinned links</p>
            <Link href={`${base}/links`} className="text-xs underline">Links &amp; Media</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {pinnedLinks.map((l) => <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="btn btn-sm max-w-xs truncate">{l.title || l.url} ↗</a>)}
          </div>
        </div>
      )}

      <div className="card mt-6 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-semibold">Next two weeks</p>
          <Link href={`${base}/calendar`} className="text-xs underline">Calendar</Link>
        </div>
        {upcoming.length === 0 ? <p className="text-sm text-ink-mute">Nothing scheduled.</p> : (
          <ul className="divide-y divide-paper-line">
            {upcoming.map((e) => (
              <li key={e.id} className="py-2">
                <Link href={`${base}/calendar/${e.id}`} className="flex flex-wrap items-baseline gap-2 text-sm hover:underline">
                  <span className="w-28 shrink-0 font-semibold">{fmtDate(e.date, { weekday: "short", month: "short", day: "numeric" })}</span>
                  <span className="chip text-white" style={{ background: typeMeta(e.type).color }}>{typeMeta(e.type).label}</span>
                  <span>{e.title}</span>
                  <span className="text-xs text-ink-mute">{fmtRange(e.start_time, e.end_time)}</span>
                </Link>
                <ul className="ml-0 mt-1 space-y-0.5 sm:ml-[7.5rem]">
                  {(sched.blocksByEvent.get(e.id) ?? []).map((b) => (
                    <li key={b.id} className="text-xs text-ink-mute">{fmtRange(b.start_time, b.end_time)} · <span className="text-ink">{b.agenda}</span> · {calledText(b, members.rows, characters.rows)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Latest reports</p>
            <Link href={`${base}/reports`} className="text-xs underline">All reports</Link>
          </div>
          {reports.rows.length === 0 ? <p className="text-sm text-ink-mute">No reports yet.</p> : (
            <ul className="divide-y divide-paper-line">
              {reports.rows.slice(0, 5).map((r) => (
                <li key={r.id}><Link href={`${base}/reports/${r.id}`} className="flex justify-between gap-2 py-2 text-sm hover:underline">
                  <span>{reportLabel(r.type)} #{r.number}</span><span className="text-ink-mute">{fmtDate(r.date)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <p className="mb-2 font-semibold">Department follow-ups ⚑</p>
          {followUps.length === 0 ? <p className="text-sm text-ink-mute">Nothing flagged.</p> : (
            <ul className="space-y-2">
              {followUps.slice(0, 8).map((s) => {
                const r = reports.rows.find((x) => x.id === s.report_id);
                return (
                  <li key={s.id}><Link href={`${base}/reports/${s.report_id}`} className="block text-sm hover:underline">
                    <b className="text-cue">{s.title}</b> <span className="text-xs text-ink-mute">{r ? `${reportLabel(r.type)} #${r.number} · ${fmtDate(r.date)}` : ""}</span>
                    <span className="line-clamp-2 block text-xs text-ink-soft">{s.body}</span>
                  </Link></li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <p className="mb-2 font-semibold">My tasks</p>
          {mine.length === 0 ? <p className="text-sm text-ink-mute">All clear.</p> : (
            <ul className="divide-y divide-paper-line">
              {mine.map((t) => (
                <li key={t.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span>{t.title}</span>
                  <span className="text-ink-mute">{t.due_date ? fmtDate(t.due_date) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <p className="mb-2 font-semibold">Stage management team</p>
          <ul className="space-y-1 text-sm">
            {members.rows.filter((m) => ["head_sm", "sm", "asm"].includes(m.role)).map((m) => (
              <li key={m.id} className="flex justify-between"><span>{m.display_name}</span><span className="text-ink-mute">{ROLE_LABEL[m.role]}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, href }: { label: string; value: number | string; href: string }) {
  return (
    <Link href={href} className="card p-4 hover:shadow-md">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </Link>
  );
}
