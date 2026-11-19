"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProduction } from "@/components/production/ProductionProvider";
import { Empty, PageHeader } from "@/components/ui";
import { NewReportModal } from "@/components/reports/NewReportModal";
import { useRows } from "@/lib/useRows";
import { REPORT_TYPES, reportLabel } from "@/lib/reports";
import type { Report, ReportType } from "@/lib/types";
import { cx, fmtDate } from "@/lib/utils";

export default function ReportsPage() {
  const { production, canEdit } = useProduction();
  const router = useRouter();
  const reports = useRows<Report>("reports", production.id, { order: [{ column: "date", ascending: false }, { column: "created_at", ascending: false }] });
  const [type, setType] = useState<ReportType | "">("");
  const [creating, setCreating] = useState(false);
  const list = reports.rows.filter((r) => !type || r.type === type);
  const base = `/p/${production.id}/reports`;

  return (
    <>
      <PageHeader help="reports"
        title="Reports"
        subtitle="Rehearsal, tech, performance and meeting reports. The SM team edits them together in real time."
        actions={
          <>
            <select className="input w-44" value={type} onChange={(e) => setType(e.target.value as ReportType | "")}>
              <option value="">All types</option>
              {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {canEdit && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New report</button>}
          </>
        }
      />
      {list.length === 0 && !reports.loading ? <Empty title="No reports yet">Create one per rehearsal or performance date.</Empty> : (
        <div className="card divide-y divide-paper-line">
          {list.map((r) => (
            <Link key={r.id} href={`${base}/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-paper">
              <div>
                <p className="font-semibold">{reportLabel(r.type)} #{r.number ?? "–"}{r.title ? ` · ${r.title}` : ""}</p>
                <p className="text-xs text-ink-mute">{fmtDate(r.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}{r.prepared_by ? ` · Prepared by ${r.prepared_by}` : ""}</p>
              </div>
              <span className={cx("chip", r.status === "final" ? "bg-green-50 text-go" : "bg-amber-50 text-stby")}>{r.status === "final" ? "Final" : "Draft"}</span>
            </Link>
          ))}
        </div>
      )}
      {creating && <NewReportModal onClose={() => setCreating(false)} onCreated={(id) => router.push(`${base}/${id}`)} />}
    </>
  );
}
