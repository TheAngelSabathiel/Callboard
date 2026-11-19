"use client";
import { useMemo, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { ErrorNote, Field, Modal, PageHeader, Tabs } from "@/components/ui";
import { ExportMenu } from "@/components/export/ExportMenu";
import { useSchedule } from "@/lib/useSchedule";
import { AVAIL, AVAIL_CYCLE, availMeta, castLabel, typeMeta } from "@/lib/schedule";
import type { Availability, AvailabilityStatus, Member } from "@/lib/types";
import { addDays, cx, dateRange, fmtDate, overlaps, parseISODate, todayISO, toMin } from "@/lib/utils";

type Group = "cast" | "sm" | "all";

export default function AvailabilityPage() {
  const { production, members, characters, canEdit, me } = useProduction();
  const s = useSchedule(production.id);
  const [group, setGroup] = useState<Group>("cast");
  const [start, setStart] = useState(() => (production.first_rehearsal && production.first_rehearsal > todayISO() ? production.first_rehearsal : todayISO()));
  const [days, setDays] = useState(28);
  const [mode, setMode] = useState<"cycle" | "detail">("cycle");
  const [edit, setEdit] = useState<{ member: Member; date: string } | null>(null);
  const [fill, setFill] = useState(false);

  const dates = useMemo(() => dateRange(start, addDays(start, days - 1)), [start, days]);
  const people = useMemo(() => members.rows.filter((m) =>
    group === "all" ? true : group === "cast" ? (m.role === "actor" || m.department === "Cast") : ["head_sm", "sm", "asm", "director", "production_manager"].includes(m.role)
  ), [members.rows, group]);

  const index = useMemo(() => {
    const m = new Map<string, Availability>();
    s.availability.rows.forEach((a) => m.set(`${a.member_id}|${a.date}`, a));
    return m;
  }, [s.availability.rows]);

  const canEditRow = (m: Member) => canEdit || m.id === me?.id;

  async function setStatus(m: Member, date: string, status: AvailabilityStatus | null, extra?: Partial<Availability>) {
    const cur = index.get(`${m.id}|${date}`);
    if (!status) { if (cur) await s.availability.remove(cur.id).catch(() => {}); return; }
    await s.availability.upsert([{ production_id: production.id, member_id: m.id, date, status, from_time: null, to_time: null, note: cur?.note ?? null, ...extra }], "member_id,date").catch(() => {});
  }

  async function bulk(ids: string[], from: string, to: string, weekdays: number[], status: AvailabilityStatus | null) {
    const days = dateRange(from, to).filter((d) => weekdays.includes(parseISODate(d).getDay()));
    if (!status) {
      const doomed = s.availability.rows.filter((a) => ids.includes(a.member_id) && days.includes(a.date));
      for (const a of doomed) await s.availability.remove(a.id).catch(() => {});
      return;
    }
    const rows = ids.flatMap((member_id) => days.map((date) => ({ production_id: production.id, member_id, date, status, from_time: null, to_time: null })));
    await s.availability.upsert(rows, "member_id,date").catch(() => {});
  }

  function onCell(m: Member, date: string) {
    if (!canEditRow(m)) return;
    if (mode === "detail") return setEdit({ member: m, date });
    const cur = index.get(`${m.id}|${date}`)?.status ?? null;
    const next = AVAIL_CYCLE[(AVAIL_CYCLE.indexOf(cur) + 1) % AVAIL_CYCLE.length];
    setStatus(m, date, next);
  }

  return (
    <>
      <PageHeader help="availability"
        title="Availability"
        subtitle="A = available · UN = unavailable · TBD = not sure · PART = partial. Everyone can update their own row."
        actions={
          <>
            <Tabs value={group} onChange={setGroup} items={[{ value: "cast", label: "Cast" }, { value: "sm", label: "Production" }, { value: "all", label: "All" }]} />
            <ExportMenu kind="availability" productionId={production.id} params={{ start, days: String(days) }} />
          </>
        }
      />
      <ErrorNote msg={s.availability.error} />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="From"><input className="input" type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} /></Field>
        <Field label="Days">
          <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 28, 42, 63, 92].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <button className="btn" onClick={() => setStart(addDays(start, -7))}>‹ Week</button>
        <button className="btn" onClick={() => setStart(addDays(start, 7))}>Week ›</button>
        <div className="ml-auto flex items-center gap-2">
          <Tabs value={mode} onChange={setMode} items={[{ value: "cycle", label: "Tap: cycle" }, { value: "detail", label: "Tap: details" }]} />
          <button className="btn" onClick={() => setFill(true)}>Bulk fill</button>
        </div>
      </div>

      <div className="card overflow-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 min-w-[180px] border-b border-r border-paper-line bg-paper px-2 py-1 text-left">Name</th>
              {dates.map((d) => {
                const wd = parseISODate(d).getDay();
                const evs = s.byDate.get(d) ?? [];
                return (
                  <th key={d} className={cx("sticky top-0 z-10 min-w-[38px] border-b border-r border-paper-line bg-paper px-0.5 py-1 text-center font-semibold", (wd === 0 || wd === 6) && "bg-[#f1ede4]")}>
                    <div className="text-[9px] uppercase text-ink-mute">{["Su", "M", "T", "W", "Th", "F", "Sa"][wd]}</div>
                    <div>{parseISODate(d).getDate()}</div>
                    <div className="flex h-1.5 justify-center gap-0.5">{evs.slice(0, 3).map((e) => <i key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ background: typeMeta(e.type).color }} title={e.title} />)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {people.map((m) => (
              <tr key={m.id} className={cx(m.id === me?.id && "bg-cue-soft/40")}>
                <td className="sticky left-0 z-10 border-b border-r border-paper-line bg-white px-2 py-1">
                  <div className="max-w-[220px] truncate font-medium" title={castLabel(m, characters.rows)}>{castLabel(m, characters.rows)}</div>
                </td>
                {dates.map((d) => {
                  const a = index.get(`${m.id}|${d}`);
                  const meta = availMeta(a?.status);
                  return (
                    <td key={d} className="border-b border-r border-paper-line p-0 text-center">
                      <button
                        className={cx("h-8 w-full text-[10px] font-bold", meta?.cls, canEditRow(m) ? "hover:ring-2 hover:ring-inset hover:ring-cue" : "cursor-default")}
                        title={[meta?.label, a?.note, a?.from_time && `${a.from_time.slice(0, 5)}–${a.to_time?.slice(0, 5) ?? ""}`].filter(Boolean).join(" · ")}
                        onClick={() => onCell(m, d)}
                        onContextMenu={(e) => { e.preventDefault(); if (canEditRow(m)) setEdit({ member: m, date: d }); }}
                      >
                        {a?.status ?? ""}{a?.note ? "•" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-mute">Right-click (or switch to “Tap: details”) to add notes or a partial time window.</p>

      <Checker dates={dates} index={index} schedule={s} />

      {edit && (
        <CellEditor
          member={edit.member} date={edit.date} current={index.get(`${edit.member.id}|${edit.date}`)}
          onClose={() => setEdit(null)}
          onSave={async (status, extra) => { await setStatus(edit.member, edit.date, status, extra); setEdit(null); }}
        />
      )}
      {fill && <BulkFill people={people.filter(canEditRow)} onClose={() => setFill(false)} onApply={async (ids, from, to, weekdays, status) => {
        await bulk(ids, from, to, weekdays, status);
        setFill(false);
      }} />}
    </>
  );
}

function CellEditor({ member, date, current, onClose, onSave }: {
  member: Member; date: string; current?: Availability; onClose: () => void;
  onSave: (s: AvailabilityStatus | null, extra?: Partial<Availability>) => Promise<void>;
}) {
  const [status, setStatus] = useState<AvailabilityStatus | "">(current?.status ?? "");
  const [from, setFrom] = useState(current?.from_time?.slice(0, 5) ?? "");
  const [to, setTo] = useState(current?.to_time?.slice(0, 5) ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  return (
    <Modal open onClose={onClose} title={`${member.display_name} · ${fmtDate(date, { weekday: "short", month: "short", day: "numeric" })}`}>
      <div className="grid grid-cols-2 gap-2">
        {AVAIL.map((a) => (
          <button key={a.value} className={cx("btn", status === a.value && "ring-2 ring-cue", a.cls)} onClick={() => setStatus(a.value)}>{a.value} · {a.label}</button>
        ))}
      </div>
      {status === "PART" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Available from"><input className="input" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Until"><input className="input" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      )}
      <Field label="Note" className="mt-3"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Flamenco class 6–8 PM" /></Field>
      <div className="mt-4 flex justify-between">
        <button className="btn btn-ghost" onClick={() => onSave(null)}>Clear</button>
        <button className="btn btn-primary" disabled={!status} onClick={() => onSave(status as AvailabilityStatus, {
          note: note || null, from_time: status === "PART" ? from || null : null, to_time: status === "PART" ? to || null : null,
        })}>Save</button>
      </div>
    </Modal>
  );
}

function BulkFill({ people, onClose, onApply }: {
  people: Member[]; onClose: () => void;
  onApply: (ids: string[], from: string, to: string, weekdays: number[], status: AvailabilityStatus | null) => Promise<void>;
}) {
  const [ids, setIds] = useState<string[]>(people.length === 1 ? [people[0].id] : []);
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(addDays(todayISO(), 27));
  const [wd, setWd] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [status, setStatus] = useState<AvailabilityStatus | "">("A");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Bulk fill availability">
      <Field label="People">
        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {people.map((m) => (
            <button key={m.id} className={cx("rounded-full border px-2 py-0.5 text-xs", ids.includes(m.id) ? "border-ink bg-ink text-white" : "border-paper-line")}
              onClick={() => setIds(ids.includes(m.id) ? ids.filter((x) => x !== m.id) : [...ids, m.id])}>{m.display_name}</button>
          ))}
        </div>
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="From"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Field label="Weekdays" className="mt-3">
        <div className="flex gap-1">
          {["Su", "M", "T", "W", "Th", "F", "Sa"].map((l, i) => (
            <button key={l} className={cx("h-8 w-9 rounded border text-xs", wd.includes(i) ? "border-ink bg-ink text-white" : "border-paper-line")}
              onClick={() => setWd(wd.includes(i) ? wd.filter((x) => x !== i) : [...wd, i])}>{l}</button>
          ))}
        </div>
      </Field>
      <Field label="Set to" className="mt-3">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as AvailabilityStatus | "")}>
          {AVAIL.map((a) => <option key={a.value} value={a.value}>{a.value} · {a.label}</option>)}
          <option value="">Clear</option>
        </select>
      </Field>
      <button className="btn btn-primary mt-4 w-full" disabled={!ids.length || busy} onClick={async () => { setBusy(true); await onApply(ids, from, to, wd, (status || null) as AvailabilityStatus | null); setBusy(false); }}>
        {busy ? "Applying…" : "Apply"}
      </button>
    </Modal>
  );
}

/** Availability checker: who can make a given date/time, and which dates suit a group best. */
function Checker({ dates, index, schedule }: {
  dates: string[]; index: Map<string, Availability>; schedule: ReturnType<typeof useSchedule>;
}) {
  const { members, characters } = useProduction();
  const [date, setDate] = useState(dates[0] ?? todayISO());
  const [from, setFrom] = useState("18:00");
  const [to, setTo] = useState("22:00");
  const [chars, setChars] = useState<string[]>([]);

  const needed = useMemo(() => {
    const ids = new Set<string>();
    chars.forEach((cid) => { const c = characters.rows.find((x) => x.id === cid); if (c?.actor_id) ids.add(c.actor_id); });
    return members.rows.filter((m) => ids.has(m.id));
  }, [chars, characters.rows, members.rows]);

  const pool = needed.length ? needed : members.rows.filter((m) => m.role === "actor" || m.department === "Cast");

  const status = (m: Member, d: string, f = from, t = to) => {
    const a = index.get(`${m.id}|${d}`);
    if (!a) return "none" as const;
    if (a.status === "PART") {
      const ok = (toMin(f) ?? 0) >= (toMin(a.from_time) ?? 0) && (toMin(t) ?? 1440) <= (toMin(a.to_time) ?? 1440);
      return ok ? ("A" as const) : ("UN" as const);
    }
    return a.status;
  };

  const res = pool.map((m) => ({ m, s: status(m, date) }));
  const ranking = needed.length
    ? dates.map((d) => ({ d, ok: needed.filter((m) => status(m, d) === "A").length, un: needed.filter((m) => status(m, d) === "UN").length }))
        .sort((a, b) => b.ok - a.ok || a.un - b.un).slice(0, 8)
    : [];
  const clashes = (schedule.byDate.get(date) ?? []).filter((e) => overlaps(e.start_time, e.end_time, from, to));

  return (
    <div className="card mt-6 p-4">
      <p className="text-lg font-bold">Availability checker</p>
      <p className="text-sm text-ink-mute">Pick characters for a scene to see who can make a slot, and which dates suit them best.</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {characters.rows.map((c) => (
          <button key={c.id} className={cx("rounded-full border px-2 py-0.5 text-xs", chars.includes(c.id) ? "border-cue bg-cue text-white" : "border-paper-line bg-white")}
            onClick={() => setChars(chars.includes(c.id) ? chars.filter((x) => x !== c.id) : [...chars, c.id])}>{c.name}</button>
        ))}
        {chars.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setChars([])}>Clear</button>}
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="flex flex-wrap gap-2">
            <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="From"><input className="input" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input className="input" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          {clashes.length > 0 && <p className="mt-2 text-xs text-stby">Already scheduled in this slot: {clashes.map((e) => e.title).join(", ")}</p>}
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {(["A", "UN", "other"] as const).map((k) => {
              const list = res.filter((r) => (k === "other" ? r.s !== "A" && r.s !== "UN" : r.s === k));
              return (
                <div key={k} className={cx("rounded-md p-2", k === "A" ? "bg-green-50" : k === "UN" ? "bg-red-50" : "bg-amber-50")}>
                  <p className="mb-1 font-bold">{k === "A" ? "Available" : k === "UN" ? "Unavailable" : "Unknown / TBD"} ({list.length})</p>
                  {list.map((r) => <p key={r.m.id}>{castLabel(r.m, characters.rows)}</p>)}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <p className="label">Best dates in view {needed.length ? `for ${needed.length} actor${needed.length > 1 ? "s" : ""}` : ""}</p>
          {needed.length === 0 ? <p className="text-sm text-ink-mute">Select characters to rank dates.</p> : (
            <table className="table-sm">
              <thead><tr><th>Date</th><th>Available</th><th>Unavailable</th><th /></tr></thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.d}>
                    <td>{fmtDate(r.d, { weekday: "short", month: "short", day: "numeric" })}</td>
                    <td className="font-semibold text-go">{r.ok}/{needed.length}</td>
                    <td className={r.un ? "text-red-700" : "text-ink-mute"}>{r.un}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setDate(r.d)}>Check</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
