"use client";
import { notify } from "@/lib/notify";
import { useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { ErrorNote, Field, Modal } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EVENT_TYPES } from "@/lib/schedule";
import type { EventType, ProdEvent } from "@/lib/types";
import { addDays } from "@/lib/utils";

export function NewEventModal({ date, onClose, onCreated }: {
  date: string; onClose: () => void; onCreated: (first: ProdEvent) => void;
}) {
  const { production, userId } = useProduction();
  const [f, setF] = useState({
    date, type: "rehearsal" as EventType, title: "Rehearsal", venue: production.rehearsal_venue ?? "",
    call_time: "", start_time: "18:00", end_time: "22:00", repeatUntil: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const dates = [f.date];
    if (f.repeatUntil && f.repeatUntil > f.date) {
      let d = addDays(f.date, 7);
      while (d <= f.repeatUntil && dates.length < 60) { dates.push(d); d = addDays(d, 7); }
    }
    const rows = dates.map((d) => ({
      production_id: production.id, date: d, type: f.type, title: f.title || "Rehearsal",
      venue: f.venue || null, call_time: f.call_time || null, start_time: f.start_time || null,
      end_time: f.end_time || null, created_by: userId,
    }));
    const { data, error } = await supabaseBrowser().from("events").insert(rows).select("*");
    setBusy(false);
    if (error) return setErr(error.message);
    notify.created(rows.length > 1 ? `${rows.length} calendar items` : "Calendar item", f.title);
    onCreated((data as ProdEvent[])[0]);
  }

  return (
    <Modal open onClose={onClose} title="New calendar item">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date"><input className="input" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Type">
            <select className="input" value={f.type} onChange={(e) => {
              const t = e.target.value as EventType;
              setF({ ...f, type: t, title: EVENT_TYPES.find((x) => x.value === t)?.label ?? f.title });
            }}>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="ACT 2 blocking" /></Field>
        <Field label="Venue"><input className="input" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} placeholder="2FL Mirror Studio" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Call"><input className="input" type="time" value={f.call_time} onChange={(e) => setF({ ...f, call_time: e.target.value })} /></Field>
          <Field label="Start"><input className="input" type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></Field>
          <Field label="End"><input className="input" type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></Field>
        </div>
        <Field label="Repeat weekly until (optional)"><input className="input" type="date" value={f.repeatUntil} onChange={(e) => setF({ ...f, repeatUntil: e.target.value })} /></Field>
        <ErrorNote msg={err} />
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Create and add agenda"}</button>
      </form>
    </Modal>
  );
}
