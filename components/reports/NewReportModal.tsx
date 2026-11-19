"use client";
import { notify } from "@/lib/notify";
import { useEffect, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { ErrorNote, Field, Modal } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { REPORT_TYPES } from "@/lib/reports";
import type { ProdEvent, ReportType } from "@/lib/types";
import { todayISO } from "@/lib/utils";

export function NewReportModal({ onClose, onCreated, initial }: {
  onClose: () => void; onCreated: (id: string) => void; initial?: { date?: string; type?: ReportType; eventId?: string };
}) {
  const { production } = useProduction();
  const [type, setType] = useState<ReportType>(initial?.type ?? "rehearsal");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [events, setEvents] = useState<ProdEvent[]>([]);
  const [eventId, setEventId] = useState(initial?.eventId ?? "");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser().from("events").select("*").eq("production_id", production.id).eq("date", date).then(({ data }: { data: ProdEvent[] | null }) => {
      const list = data ?? [];
      setEvents(list);
      if (!initial?.eventId) setEventId(list[0]?.id ?? "");
    });
  }, [date, production.id, initial?.eventId]);

  async function create() {
    const { data, error } = await supabaseBrowser().rpc("create_report", {
      p_production: production.id, p_type: type, p_date: date, p_event: eventId || null,
    });
    if (error) return setErr(error.message);
    notify.created("Report", date);
    onCreated(data as string);
  }

  return (
    <Modal open onClose={onClose} title="New report">
      <div className="space-y-3">
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ReportType)}>
            {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Link to calendar item">
          <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">None</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </Field>
        <p className="text-xs text-ink-mute">Linking pre-fills the time breakdown and attendance from the day&apos;s agenda.</p>
        <ErrorNote msg={err} />
        <button className="btn btn-primary w-full" onClick={create}>Create report</button>
      </div>
    </Modal>
  );
}
