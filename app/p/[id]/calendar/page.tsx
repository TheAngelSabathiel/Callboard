"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProduction } from "@/components/production/ProductionProvider";
import { PageHeader, Tabs } from "@/components/ui";
import { NewEventModal } from "@/components/schedule/NewEventModal";
import { ExportMenu } from "@/components/export/ExportMenu";
import { useSchedule } from "@/lib/useSchedule";
import { EVENT_TYPES, blockConflicts, calledText, typeMeta } from "@/lib/schedule";
import { cx, fmtDate, fmtLongDate, fmtRange, fmtTime, monthMatrix, parseISODate, todayISO } from "@/lib/utils";

export default function CalendarPage() {
  const { production, canEdit, members, characters } = useProduction();
  const router = useRouter();
  const s = useSchedule(production.id);
  const [view, setView] = useState<"month" | "agenda">("month");
  const startRef = production.first_rehearsal && production.first_rehearsal > todayISO() ? production.first_rehearsal : todayISO();
  const [cursor, setCursor] = useState(() => { const d = parseISODate(startRef); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState<string>(todayISO());
  const [creating, setCreating] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const weeks = useMemo(() => monthMatrix(cursor.y, cursor.m), [cursor]);
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const base = `/p/${production.id}/calendar`;
  const cast = members.rows.filter((m) => m.role === "actor" || m.department === "Cast");

  const shift = (n: number) => setCursor(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const agendaDates = Array.from(s.byDate.keys()).sort().filter((d) => showPast || d >= todayISO());

  return (
    <>
      <PageHeader help="calendar"
        title="Calendar"
        subtitle="Rehearsals, tech, shows and meetings with a time-blocked agenda per day."
        actions={
          <>
            <Tabs value={view} onChange={setView} items={[{ value: "month", label: "Month" }, { value: "agenda", label: "Agenda" }]} />
            {canEdit && <button className="btn btn-primary" onClick={() => setCreating(selected)}>+ New</button>}
            <ExportMenu kind="calendar" productionId={production.id} />
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
        {EVENT_TYPES.map((t) => (
          <span key={t.value} className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />{t.label}</span>
        ))}
        <span className="inline-flex items-center gap-1"><i className="chip bg-red-100 px-1 text-red-800">2</i>cast unavailable</span>
      </div>

      {view === "month" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-paper-line p-2">
              <button className="btn btn-sm" onClick={() => shift(-1)}>‹</button>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{monthLabel}</p>
                <button className="btn btn-ghost btn-sm" onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); setSelected(todayISO()); }}>Today</button>
              </div>
              <button className="btn btn-sm" onClick={() => shift(1)}>›</button>
            </div>
            <div className="grid grid-cols-7 border-b border-paper-line bg-paper text-center text-[10px] font-bold uppercase tracking-wide text-ink-mute">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {weeks.flat().map((d) => {
                const inMonth = parseISODate(d).getMonth() === cursor.m;
                const evs = s.byDate.get(d) ?? [];
                const un = (s.availByDate.get(d) ?? []).filter((a) => a.status === "UN" && cast.some((c) => c.id === a.member_id)).length;
                return (
                  <button
                    key={d}
                    onClick={() => setSelected(d)}
                    onDoubleClick={() => canEdit && setCreating(d)}
                    className={cx(
                      "min-h-[64px] border-b border-r border-paper-line p-1 text-left align-top sm:min-h-[96px]",
                      !inMonth && "bg-paper/60 text-ink-mute",
                      selected === d && "ring-2 ring-inset ring-cue"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cx("text-xs font-semibold", d === todayISO() && "rounded bg-cue px-1 text-white")}>{parseISODate(d).getDate()}</span>
                      {un > 0 && <span className="chip bg-red-100 px-1 text-red-800">{un}</span>}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {evs.slice(0, 3).map((e) => (
                        <div key={e.id} className="truncate rounded px-1 text-[10px] font-medium text-white" style={{ background: typeMeta(e.type).color }}>
                          <span className="hidden sm:inline">{e.start_time ? fmtTime(e.start_time).replace(":00", "") + " " : ""}</span>{e.title}
                        </div>
                      ))}
                      {evs.length > 3 && <p className="text-[10px] text-ink-mute">+{evs.length - 3} more</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <DayPanel date={selected} schedule={s} onNew={() => setCreating(selected)} base={base} />
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-mute"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past dates</label>
          {agendaDates.length === 0 && <p className="text-sm text-ink-mute">No upcoming items.</p>}
          {agendaDates.map((d) => (
            <div key={d} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-paper-line bg-paper px-3 py-2">
                <p className="text-sm font-bold">{fmtLongDate(d)}</p>
              </div>
              {(s.byDate.get(d) ?? []).map((e) => {
                const blocks = s.blocksByEvent.get(e.id) ?? [];
                return (
                  <div key={e.id} className="p-3">
                    <Link href={`${base}/${e.id}`} className="flex flex-wrap items-baseline gap-2 hover:underline">
                      <span className="chip text-white" style={{ background: typeMeta(e.type).color }}>{typeMeta(e.type).label}</span>
                      <span className="font-semibold">{e.title}</span>
                      <span className="text-xs text-ink-mute">{fmtRange(e.start_time, e.end_time)}{e.venue ? ` · ${e.venue}` : ""}</span>
                    </Link>
                    {blocks.length > 0 && (
                      <div className="mt-2 overflow-x-auto">
                        <table className="table-sm min-w-[560px]">
                          <tbody>
                            {blocks.map((b) => {
                              const c = blockConflicts(b, d, members.rows, s.availability.rows).filter((x) => x.status === "UN");
                              return (
                                <tr key={b.id}>
                                  <td className="w-40 whitespace-nowrap text-xs text-ink-mute">{fmtRange(b.start_time, b.end_time)}</td>
                                  <td className="font-medium">{b.agenda}{b.scenes ? <span className="text-ink-mute"> · {b.scenes}</span> : null}</td>
                                  <td className="text-xs">{calledText(b, members.rows, characters.rows)}
                                    {c.length > 0 && <span className="ml-1 chip bg-red-100 text-red-800">{c.length} conflict{c.length > 1 ? "s" : ""}</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <NewEventModal date={creating} onClose={() => setCreating(null)} onCreated={(e) => { setCreating(null); router.push(`${base}/${e.id}`); }} />
      )}
    </>
  );
}

function DayPanel({ date, schedule, onNew, base }: {
  date: string; schedule: ReturnType<typeof useSchedule>; onNew: () => void; base: string;
}) {
  const { canEdit, members, characters } = useProduction();
  const evs = schedule.byDate.get(date) ?? [];
  const avail = schedule.availByDate.get(date) ?? [];
  const un = avail.filter((a) => a.status === "UN");
  const tbd = avail.filter((a) => a.status === "TBD" || a.status === "PART");
  const name = (id: string) => members.rows.find((m) => m.id === id)?.display_name ?? "";
  return (
    <div className="card h-fit p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{fmtDate(date, { weekday: "long" })}</p>
      <p className="text-lg font-bold">{fmtDate(date, { month: "long", day: "numeric", year: "numeric" })}</p>
      <div className="mt-3 space-y-3">
        {evs.length === 0 && <p className="text-sm text-ink-mute">Nothing scheduled.</p>}
        {evs.map((e) => (
          <Link key={e.id} href={`${base}/${e.id}`} className="block rounded-md border border-paper-line p-2 hover:bg-paper">
            <div className="flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-sm" style={{ background: typeMeta(e.type).color }} />
              <span className="text-sm font-semibold">{e.title}</span>
            </div>
            <p className="text-xs text-ink-mute">{fmtRange(e.start_time, e.end_time)}{e.venue ? ` · ${e.venue}` : ""}</p>
            <ul className="mt-1 space-y-0.5">
              {(schedule.blocksByEvent.get(e.id) ?? []).map((b) => (
                <li key={b.id} className="text-xs"><span className="text-ink-mute">{fmtTime(b.start_time)}</span> {b.agenda} <span className="text-ink-mute">· {calledText(b, members.rows, characters.rows)}</span></li>
              ))}
            </ul>
          </Link>
        ))}
        {canEdit && <button className="btn btn-sm w-full" onClick={onNew}>+ Add on this date</button>}
      </div>
      {(un.length > 0 || tbd.length > 0) && (
        <div className="mt-4 border-t border-paper-line pt-3 text-xs">
          {un.length > 0 && <p><b className="text-red-700">Unavailable:</b> {un.map((a) => name(a.member_id)).join(", ")}</p>}
          {tbd.length > 0 && <p className="mt-1"><b className="text-stby">Not sure / partial:</b> {tbd.map((a) => name(a.member_id) + (a.note ? ` (${a.note})` : "")).join(", ")}</p>}
        </div>
      )}
    </div>
  );
}
