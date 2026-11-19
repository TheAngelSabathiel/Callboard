"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProduction } from "@/components/production/ProductionProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ProdEvent, ReportType } from "@/lib/types";
import { ExportMenu } from "@/components/export/ExportMenu";

const REPORT_FOR: Record<string, ReportType> = { show: "performance", tech: "tech", dress: "tech", meeting: "meeting" };

/** Actions on a calendar item: open/create its SM report. Call sheet print/export. */
export function EventActions({ event }: { event: ProdEvent }) {
  const { production, canEdit } = useProduction();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function openReport() {
    setBusy(true);
    const sb = supabaseBrowser();
    const { data } = await sb.from("reports").select("id").eq("event_id", event.id).limit(1);
    let id = (data as { id: string }[] | null)?.[0]?.id;
    if (!id && canEdit) {
      const res = await sb.rpc("create_report", {
        p_production: production.id, p_type: REPORT_FOR[event.type] ?? "rehearsal", p_date: event.date, p_event: event.id,
      });
      id = res.data as string | undefined;
    }
    setBusy(false);
    if (id) router.push(`/p/${production.id}/reports/${id}`);
    else setMsg("No report for this date yet.");
  }

  return (
    <>
      {canEdit && <a className="btn btn-cue" href={`/p/${production.id}/live?date=${event.date}`}>● Rehearsal Mode</a>}
      <button className="btn" onClick={openReport} disabled={busy} title={msg ?? undefined}>{busy ? "Opening…" : msg ?? "SM report"}</button>
      <ExportMenu kind="callsheet" params={{ eventId: event.id }} label="Call sheet" />
      <ExportMenu kind="signin" params={{ eventId: event.id }} label="Sign-in sheet" />
    </>
  );
}
