"use client";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProduction } from "@/components/production/ProductionProvider";
import { ConfirmButton, ErrorNote, Field, InlineInput, PageHeader } from "@/components/ui";
import { ExportMenu } from "@/components/export/ExportMenu";
import { LinkChips } from "@/components/LinkChips";
import { useRows } from "@/lib/useRows";
import { usePresence } from "@/lib/usePresence";
import { ATTENDANCE, TIMING_FIELDS, reportLabel, runTimes } from "@/lib/reports";
import type { Attendance, AttendanceStatus, Report, ReportSection } from "@/lib/types";
import { cx, fmtLongDate, initials } from "@/lib/utils";
import { castLabel } from "@/lib/schedule";

export default function ReportEditor({ params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { reportId } = use(params);
  const { production, canEdit, me, userId, members } = useProduction();
  const router = useRouter();
  const reports = useRows<Report>("reports", production.id, { order: [{ column: "date" }] });
  const sections = useRows<ReportSection>("report_sections", reportId, { column: "report_id", order: [{ column: "sort_order" }], notify: false });
  const attendance = useRows<Attendance>("attendance", reportId, { column: "report_id" });
  const r = reports.rows.find((x) => x.id === reportId);
  const presence = usePresence(`report:${reportId}`, { user_id: userId, name: me?.display_name ?? "Someone" });
  const base = `/p/${production.id}/reports`;
  const editable = canEdit;

  if (reports.loading) return <p className="text-sm text-ink-mute">Loading…</p>;
  if (!r) return <p className="text-sm">Report not found. <Link href={base} className="underline">Back</Link></p>;

  const upd = (p: Partial<Report>) => reports.update(r.id, p);
  const timingFields = TIMING_FIELDS[r.type];
  const derived = r.type === "performance" ? runTimes(r.timings ?? {}) : [];

  async function addSection() {
    await sections.insert({ report_id: r!.id, production_id: production.id, key: `custom_${Date.now()}`, title: "New section", body: "", sort_order: sections.rows.length + 1 });
  }

  return (
    <>
      <Link href={base} className="no-print text-sm text-ink-mute">← Reports</Link>
      <PageHeader help="report"
        title={`${reportLabel(r.type)} #${r.number ?? ""}`}
        subtitle={<>{fmtLongDate(r.date)}{r.title ? ` · ${r.title}` : ""}</>}
        actions={
          <>
            <div className="flex -space-x-2">
              {presence.others.map((o) => (
                <span key={o.user_id} title={`${o.name}${o.section ? " · editing" : " · viewing"}`}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-cue text-[10px] font-bold text-white">
                  {initials(o.name)}
                </span>
              ))}
            </div>
            {editable && (
              <button className={cx("btn", r.status === "final" ? "border-go text-go" : "")} onClick={() => upd({ status: r.status === "final" ? "draft" : "final" })}>
                {r.status === "final" ? "✓ Final" : "Mark final"}
              </button>
            )}
            <ExportMenu kind="report" productionId={production.id} params={{ reportId: r.id }} />
            {editable && <ConfirmButton onConfirm={async () => { await reports.remove(r.id); router.push(base); }}>Delete</ConfirmButton>}
          </>
        }
      />
      <ErrorNote msg={reports.error || sections.error} />

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Date"><InlineInput type="date" disabled={!editable} value={r.date} onSave={(v) => v && upd({ date: v })} /></Field>
        <Field label="Title / Focus"><InlineInput disabled={!editable} value={r.title} onSave={(v) => upd({ title: v || null })} placeholder="ACT 2 blocking" /></Field>
        <Field label="Venue"><InlineInput disabled={!editable} value={r.venue} onSave={(v) => upd({ venue: v || null })} /></Field>
        <Field label="Prepared by"><InlineInput disabled={!editable} value={r.prepared_by} onSave={(v) => upd({ prepared_by: v || null })} /></Field>
        <Field label="Start time"><InlineInput type="time" disabled={!editable} value={r.start_time?.slice(0, 5)} onSave={(v) => upd({ start_time: v || null })} /></Field>
        <Field label="End time"><InlineInput type="time" disabled={!editable} value={r.end_time?.slice(0, 5)} onSave={(v) => upd({ end_time: v || null })} /></Field>
        <Field label="Agenda" className="sm:col-span-2"><InlineInput disabled={!editable} value={r.agenda} onSave={(v) => upd({ agenda: v || null })} placeholder={r.type === "meeting" ? "December rehearsal agenda" : "Units 30–40"} /></Field>
      </div>

      {timingFields.length > 0 && (
        <div className="card mt-4 p-4">
          <p className="mb-2 font-semibold">{r.type === "performance" ? "Running times" : "Times"}</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {timingFields.map((f) => (
              <Field key={f.key} label={f.label}>
                <InlineInput type={f.kind === "text" ? "text" : "time"} disabled={!editable} value={r.timings?.[f.key] ?? ""}
                  onSave={(v) => upd({ timings: { ...(r.timings ?? {}), [f.key]: v } })} />
              </Field>
            ))}
          </div>
          {derived.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-4 rounded-md bg-paper p-2 text-sm">
              {derived.map((d) => <span key={d.label}><span className="text-ink-mute">{d.label}:</span> <b>{d.value}</b></span>)}
            </div>
          )}
        </div>
      )}

      <AttendancePanel reportId={r.id} attendance={attendance} editable={editable} meeting={r.type === "meeting"} />

      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="text-lg font-bold">Notes by department</h2>
        {editable && <button className="btn btn-sm" onClick={addSection}>+ Section</button>}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {sections.rows.map((s) => (
          <SectionEditor
            key={s.id}
            section={s}
            editable={editable}
            editors={presence.others.filter((o) => o.section === s.id).map((o) => o.name)}
            onFocus={(f) => presence.focus(f ? s.id : null)}
            onSave={(patch) => sections.update(s.id, patch)}
            onDelete={() => sections.remove(s.id)}
            updatedByName={members.rows.find((m) => m.user_id === s.updated_by)?.display_name}
          />
        ))}
      </div>
    </>
  );
}

function SectionEditor({ section, editable, editors, onFocus, onSave, onDelete, updatedByName }: {
  section: ReportSection; editable: boolean; editors: string[]; onFocus: (f: boolean) => void;
  onSave: (p: Partial<ReportSection>) => Promise<void>; onDelete: () => void; updatedByName?: string;
}) {
  const [text, setText] = useState(section.body);
  const [focused, setFocused] = useState(false);
  const [remote, setRemote] = useState(false);
  const [saving, setSaving] = useState(false);
  const lastSaved = useRef(section.body);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (section.body === lastSaved.current) return;
    if (!focused) { setText(section.body); lastSaved.current = section.body; setRemote(false); }
    else setRemote(true);
  }, [section.body, focused]);

  const pending = useRef<string | null>(null);
  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    const v = pending.current;
    if (v === null) return;
    pending.current = null;
    setSaving(true);
    lastSaved.current = v;
    await onSave({ body: v }).catch(() => {});
    setSaving(false);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  // save anything still pending when leaving the page
  useEffect(() => () => { void flushRef.current(); }, []);

  const change = (v: string) => {
    setText(v);
    pending.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };

  const rows = Math.min(14, Math.max(3, text.split("\n").length + 1));

  return (
    <div className={cx("card p-3", section.needs_attention && "border-cue", editors.length > 0 && "ring-2 ring-cue/30")}>
      <div className="mb-1 flex items-center justify-between gap-2">
        {editable ? (
          <InlineInput value={section.title} onSave={(v) => v && onSave({ title: v })} className="border-transparent px-1 font-semibold shadow-none" />
        ) : <p className="font-semibold">{section.title}</p>}
        <div className="flex shrink-0 items-center gap-1">
          {editable && (
            <button title="Flag for department follow-up" className={cx("btn btn-sm", section.needs_attention ? "btn-cue" : "btn-ghost")} onClick={() => onSave({ needs_attention: !section.needs_attention })}>⚑</button>
          )}
          {editable && section.key.startsWith("custom_") && <ConfirmButton onConfirm={onDelete}>✕</ConfirmButton>}
        </div>
      </div>
      {editable ? (
        <textarea
          className="input font-mono text-[13px] leading-relaxed"
          rows={rows}
          value={text}
          placeholder="No notes. Thank you."
          onFocus={() => { setFocused(true); onFocus(true); }}
          onBlur={() => { void flush(); setFocused(false); onFocus(false); }}
          onChange={(e) => change(e.target.value)}
        />
      ) : <p className="whitespace-pre-wrap text-sm">{section.body || <span className="text-ink-mute">No notes.</span>}</p>}
      <LinkChips text={text} className="mt-1" />
      <div className="mt-1 flex items-center justify-between text-[11px] text-ink-mute">
        <span>{editors.length > 0 ? `${editors.join(", ")} typing…` : updatedByName ? `Last edit: ${updatedByName}` : ""}</span>
        <span>{saving ? "Saving…" : ""}</span>
      </div>
      {remote && (
        <button className="mt-1 w-full rounded bg-amber-50 px-2 py-1 text-left text-xs text-stby" onClick={() => { setText(section.body); lastSaved.current = section.body; setRemote(false); }}>
          Someone else changed this section. Tap to load their version (your unsaved typing will be replaced).
        </button>
      )}
    </div>
  );
}

function AttendancePanel({ reportId, attendance, editable, meeting }: {
  reportId: string; attendance: ReturnType<typeof useRows<Attendance>>; editable: boolean; meeting: boolean;
}) {
  const { production, members, characters } = useProduction();
  const [add, setAdd] = useState("");
  const listed = new Set(attendance.rows.map((a) => a.member_id));
  const rows = useMemo(() => [...attendance.rows].sort((a, b) => {
    const ma = members.rows.find((m) => m.id === a.member_id), mb = members.rows.find((m) => m.id === b.member_id);
    return (ma?.sort_order ?? 0) - (mb?.sort_order ?? 0) || (ma?.display_name ?? "").localeCompare(mb?.display_name ?? "");
  }), [attendance.rows, members.rows]);
  const counts = ATTENDANCE.map((s) => ({ ...s, n: attendance.rows.filter((a) => a.status === s.value).length })).filter((s) => s.n);

  async function addMany(ids: string[]) {
    const fresh = ids.filter((id) => !listed.has(id));
    if (fresh.length) await attendance.insertMany(fresh.map((member_id) => ({ report_id: reportId, production_id: production.id, member_id, status: "present" as AttendanceStatus })));
  }

  return (
    <div className="card mt-4 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{meeting ? "Present" : "Attendance"}</p>
        <div className="flex flex-wrap gap-1">{counts.map((c) => <span key={c.value} className={cx("chip", c.cls)}>{c.label} {c.n}</span>)}</div>
      </div>
      <div className="divide-y divide-paper-line">
        {rows.map((a) => {
          const m = members.rows.find((x) => x.id === a.member_id);
          if (!m) return null;
          return (
            <div key={a.id} className="grid items-center gap-2 py-1.5 sm:grid-cols-[1fr_140px_110px_1fr_auto]">
              <span className="text-sm">{castLabel(m, characters.rows)}</span>
              <select className="input py-1 text-xs" disabled={!editable} value={a.status} onChange={(e) => attendance.update(a.id, { status: e.target.value as AttendanceStatus })}>
                {ATTENDANCE.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <InlineInput type="time" className="py-1 text-xs" disabled={!editable || a.status !== "late"} value={a.arrival_time?.slice(0, 5)} onSave={(v) => attendance.update(a.id, { arrival_time: v || null })} />
              <InlineInput className="py-1 text-xs" disabled={!editable} value={a.note} onSave={(v) => attendance.update(a.id, { note: v || null })} placeholder="Note" />
              {editable ? <ConfirmButton onConfirm={() => attendance.remove(a.id)}>✕</ConfirmButton> : <span />}
            </div>
          );
        })}
      </div>
      {editable && (
        <div className="mt-3 flex flex-wrap gap-2">
          <select className="input w-56" value={add} onChange={async (e) => { setAdd(""); if (e.target.value) await addMany([e.target.value]); }}>
            <option value="">+ Add person…</option>
            {members.rows.filter((m) => !listed.has(m.id)).map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
          <button className="btn btn-sm" onClick={() => addMany(members.rows.filter((m) => m.role === "actor" || m.department === "Cast").map((m) => m.id))}>Add all cast</button>
          <button className="btn btn-sm" onClick={() => addMany(members.rows.filter((m) => ["head_sm", "sm", "asm", "director", "production_manager"].includes(m.role)).map((m) => m.id))}>Add production team</button>
        </div>
      )}
    </div>
  );
}

