"use client";
import { notify } from "@/lib/notify";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProduction } from "@/components/production/ProductionProvider";
import { ConfirmButton, ErrorNote, Field, InlineInput, InlineTextarea, Modal, PageHeader } from "@/components/ui";
import { CalledPicker } from "@/components/schedule/CalledPicker";
import { EventActions } from "@/components/schedule/EventActions";
import { useRows } from "@/lib/useRows";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EVENT_TYPES, blockConflicts, calledText, typeMeta } from "@/lib/schedule";
import type { Availability, EventBlock, EventType, ProdEvent } from "@/lib/types";
import { cx, fmtLongDate, fmtRange } from "@/lib/utils";

export default function EventPage({ params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { eventId } = use(params);
  const { production, canEdit, members, characters } = useProduction();
  const router = useRouter();
  const events = useRows<ProdEvent>("events", production.id, { order: [{ column: "date" }] });
  const blocks = useRows<EventBlock>("event_blocks", eventId, { column: "event_id", order: [{ column: "sort_order" }, { column: "start_time" }] });
  const avail = useRows<Availability>("availability", production.id);
  const ev = events.rows.find((e) => e.id === eventId);
  const [dup, setDup] = useState(false);
  const base = `/p/${production.id}/calendar`;

  const dayAvail = useMemo(() => avail.rows.filter((a) => a.date === ev?.date), [avail.rows, ev?.date]);

  if (events.loading) return <p className="text-sm text-ink-mute">Loading…</p>;
  if (!ev) return <p className="text-sm">Not found. <Link className="underline" href={base}>Back to calendar</Link></p>;

  const upd = (patch: Partial<ProdEvent>) => events.update(ev.id, patch);

  async function addBlock(preset?: Partial<EventBlock>) {
    const last = blocks.rows[blocks.rows.length - 1];
    await blocks.insert({
      event_id: eventId, production_id: production.id, agenda: "", called_ids: [], called_all: false,
      start_time: last?.end_time ?? ev!.start_time, end_time: null, sort_order: blocks.rows.length, ...preset,
    });
  }

  async function move(b: EventBlock, dir: -1 | 1) {
    const i = blocks.rows.findIndex((x) => x.id === b.id);
    const j = i + dir;
    if (j < 0 || j >= blocks.rows.length) return;
    const other = blocks.rows[j];
    await Promise.all([blocks.update(b.id, { sort_order: j }), blocks.update(other.id, { sort_order: i })]);
    blocks.setRows((cur) => [...cur].sort((a, c) => a.sort_order - c.sort_order));
  }

  return (
    <>
      <Link href={base} className="no-print text-sm text-ink-mute">← Calendar</Link>
      <PageHeader help="event"
        title={ev.title}
        subtitle={<>{fmtLongDate(ev.date)} · {fmtRange(ev.start_time, ev.end_time)}{ev.venue ? ` · ${ev.venue}` : ""}</>}
        actions={
          <>
            <EventActions event={ev} />
            {canEdit && <button className="btn" onClick={() => setDup(true)}>Duplicate</button>}
            {canEdit && <ConfirmButton onConfirm={async () => { await events.remove(ev.id); router.push(base); }}>Delete</ConfirmButton>}
          </>
        }
      />

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Date"><InlineInput type="date" disabled={!canEdit} value={ev.date} onSave={(v) => v && upd({ date: v })} /></Field>
        <Field label="Type">
          <select className="input" disabled={!canEdit} value={ev.type} onChange={(e) => upd({ type: e.target.value as EventType })}>
            {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Title" className="sm:col-span-2"><InlineInput disabled={!canEdit} value={ev.title} onSave={(v) => upd({ title: v || typeMeta(ev.type).label })} /></Field>
        <Field label="Venue" className="sm:col-span-2"><InlineInput disabled={!canEdit} value={ev.venue} onSave={(v) => upd({ venue: v || null })} /></Field>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <Field label="Call"><InlineInput type="time" disabled={!canEdit} value={ev.call_time?.slice(0, 5)} onSave={(v) => upd({ call_time: v || null })} /></Field>
          <Field label="Start"><InlineInput type="time" disabled={!canEdit} value={ev.start_time?.slice(0, 5)} onSave={(v) => upd({ start_time: v || null })} /></Field>
          <Field label="End"><InlineInput type="time" disabled={!canEdit} value={ev.end_time?.slice(0, 5)} onSave={(v) => upd({ end_time: v || null })} /></Field>
        </div>
        <Field label="Notes for the company" className="sm:col-span-2"><InlineTextarea disabled={!canEdit} rows={4} value={ev.notes} onSave={(v) => upd({ notes: v || null })} placeholder="- We will polish ACT 1 (pg. 40–67)…" /></Field>
        <Field label="Reminders" className="sm:col-span-2"><InlineTextarea disabled={!canEdit} rows={4} value={ev.reminders} onSave={(v) => upd({ reminders: v || null })} placeholder="Bring your own tumblers. Practice CLAYGO." /></Field>
      </div>

      <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Agenda</h2>
        {canEdit && (
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={() => addBlock({ agenda: "Call time / Arrival", called_all: true })}>+ Call time</button>
            <button className="btn btn-sm" onClick={() => addBlock({ agenda: "Dinner Break" })}>+ Break</button>
            <button className="btn btn-sm" onClick={() => addBlock({ agenda: "Company call" , called_all: true })}>+ Company call</button>
            <button className="btn btn-primary btn-sm" onClick={() => addBlock()}>+ Block</button>
          </div>
        )}
      </div>
      <ErrorNote msg={blocks.error} />

      <div className="space-y-3">
        {blocks.rows.length === 0 && <p className="card p-4 text-sm text-ink-mute">No agenda blocks yet.</p>}
        {blocks.rows.map((b, i) => {
          const conflicts = blockConflicts(b, ev.date, members.rows, dayAvail);
          const hard = conflicts.filter((c) => c.status === "UN" || c.status === "PART");
          const soft = conflicts.filter((c) => c.status === "TBD" || c.status === "none");
          return (
            <div key={b.id} className={cx("card p-3", hard.length > 0 && "border-red-300")}>
              <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr_1fr_auto]">
                <Field label="From"><InlineInput type="time" disabled={!canEdit} value={b.start_time?.slice(0, 5)} onSave={(v) => blocks.update(b.id, { start_time: v || null })} className="w-28" /></Field>
                <Field label="To"><InlineInput type="time" disabled={!canEdit} value={b.end_time?.slice(0, 5)} onSave={(v) => blocks.update(b.id, { end_time: v || null })} className="w-28" /></Field>
                <Field label="Agenda"><InlineInput disabled={!canEdit} value={b.agenda} onSave={(v) => blocks.update(b.id, { agenda: v })} placeholder="ACT 2 blocking" /></Field>
                <Field label="Units / pages"><InlineInput disabled={!canEdit} value={b.scenes} onSave={(v) => blocks.update(b.id, { scenes: v || null })} placeholder="Unit 30–33, pg. 140–154" /></Field>
                {canEdit && (
                  <div className="flex items-end gap-1">
                    <button className="btn btn-ghost btn-sm" onClick={() => move(b, -1)} disabled={i === 0}>↑</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => move(b, 1)} disabled={i === blocks.rows.length - 1}>↓</button>
                    <ConfirmButton onConfirm={() => blocks.remove(b.id)}>✕</ConfirmButton>
                  </div>
                )}
              </div>
              <div className="mt-2">
                <span className="label">Called</span>
                {canEdit ? (
                  <CalledPicker value={b.called_ids ?? []} all={b.called_all} onChange={(ids, all) => blocks.update(b.id, { called_ids: ids, called_all: all })} />
                ) : <p className="text-sm">{calledText(b, members.rows, characters.rows) || "—"}</p>}
              </div>
              {(hard.length > 0 || soft.length > 0) && (
                <div className="mt-2 space-y-1 rounded-md bg-paper p-2 text-xs">
                  {hard.length > 0 && <p><b className="text-red-700">Conflicts:</b> {hard.map((c) => `${c.member.display_name} (${c.status}${c.note ? `: ${c.note}` : ""})`).join(", ")}</p>}
                  {soft.length > 0 && <p><b className="text-stby">Unconfirmed:</b> {soft.map((c) => `${c.member.display_name}${c.status === "none" ? " (no response)" : " (TBD)"}`).join(", ")}</p>}
                </div>
              )}
              <InlineTextarea disabled={!canEdit} rows={1} className="mt-2 text-xs" value={b.notes} onSave={(v) => blocks.update(b.id, { notes: v || null })} placeholder="Block notes (optional)" />
            </div>
          );
        })}
      </div>

      {dup && <DuplicateModal event={ev} blocks={blocks.rows} onClose={() => setDup(false)} onDone={(id) => { setDup(false); router.push(`${base}/${id}`); }} />}
    </>
  );
}

function DuplicateModal({ event, blocks, onClose, onDone }: {
  event: ProdEvent; blocks: EventBlock[]; onClose: () => void; onDone: (id: string) => void;
}) {
  const [date, setDate] = useState(event.date);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    const sb = supabaseBrowser();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, ...rest } = event;
    const { data, error } = await sb.from("events").insert({ ...rest, date }).select("*").single();
    if (error) return setErr(error.message);
    const newId = (data as ProdEvent).id;
    if (blocks.length) {
      const { error: e2 } = await sb.from("event_blocks").insert(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        blocks.map(({ id: _i, event_id: _e, ...b }) => ({ ...b, event_id: newId }))
      );
      if (e2) return setErr(e2.message);
    }
    notify.created("Copy of the day", date);
    onDone(newId);
  }
  return (
    <Modal open onClose={onClose} title="Duplicate to another date">
      <Field label="New date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <ErrorNote msg={err} />
      <button className="btn btn-primary mt-3 w-full" onClick={go}>Duplicate with agenda</button>
    </Modal>
  );
}
