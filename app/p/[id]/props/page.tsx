"use client";
import { useMemo, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { ConfirmButton, InlineInput, PageHeader } from "@/components/ui";
import { QuickCapture } from "@/components/live/QuickCapture";
import { EditableGrid, type GridColumn } from "@/components/EditableGrid";
import { ExportMenu } from "@/components/export/ExportMenu";
import { useRows } from "@/lib/useRows";
import type { Prop } from "@/lib/types";
import { cx } from "@/lib/utils";

const PROP_STATUSES = ["Needed", "Sourcing", "Rehearsal prop", "Show-ready", "Repair", "Cut"];
const opts = (l: string[]) => l.map((x) => ({ value: x, label: x }));

export default function PropsPage() {
  const { production, canEdit } = useProduction();
  const props = useRows<Prop>("props", production.id, { order: [{ column: "sort_order" }, { column: "created_at" }] });
  const [status, setStatus] = useState("");
  const rows = useMemo(() => props.rows.filter((p) => !status || p.status === status), [props.rows, status]);
  const columns: GridColumn<Prop>[] = [
    { key: "name", label: "Prop", width: 200, type: "multiline" },
    { key: "quantity", label: "Qty", width: 60, type: "number" },
    { key: "category", label: "Type", width: 130, type: "select", options: opts(["Hand prop", "Set prop", "Set dressing", "Consumable", "Costume prop", "Practical"]) },
    { key: "scene", label: "Used in (unit / pg)", width: 150, type: "multiline" },
    { key: "character", label: "Handled by", width: 140 },
    { key: "preset", label: "Preset", width: 140, type: "multiline" },
    { key: "source", label: "Source", width: 120, type: "select", options: opts(["Stock", "Borrowed", "Bought", "Built", "Rented", "Actor's own"]) },
    { key: "status", label: "Status", width: 130, type: "select", options: opts(PROP_STATUSES) },
    { key: "notes", label: "Notes", width: 220, type: "multiline" },
  ];
  const counts = PROP_STATUSES.map((s) => ({ s, n: props.rows.filter((p) => p.status === s).length }));
  return (
    <>
      <PageHeader help="props" title="Props Tracker" subtitle="What's needed, where it lives, who handles it, and whether it's show-ready." actions={<ExportMenu kind="props" />} />
      <div className="no-print mb-3 flex flex-wrap gap-1 text-xs">
        <button className={cx("rounded px-2 py-1 font-semibold", !status ? "bg-ink text-white" : "bg-white ring-1 ring-paper-line")} onClick={() => setStatus("")}>All · {props.rows.length}</button>
        {counts.map(({ s, n }) => (
          <button key={s} className={cx("rounded px-2 py-1 font-semibold", status === s ? "bg-ink text-white" : "bg-white ring-1 ring-paper-line")} onClick={() => setStatus(s)}>{s} · {n}</button>
        ))}
      </div>
      {canEdit && (
        <div className="no-print card mb-4 p-3">
          <p className="mb-2 text-sm font-bold">Quick add <span className="font-normal text-ink-mute">· type the prop, press Enter</span></p>
          <QuickCapture modes={["prop"]} compact onSaved={() => setTimeout(() => props.reload(), 400)} />
        </div>
      )}

      {/* Phones: cards with one-tap status */}
      <div className="space-y-2 sm:hidden">
        {rows.map((p) => <PropCard key={p.id} p={p} editable={canEdit} onPatch={(patch) => props.update(p.id, patch)} onDelete={() => props.remove(p.id)} />)}
        {rows.length === 0 && <p className="text-sm text-ink-mute">No props yet.</p>}
      </div>

      <div className="hidden sm:block">
        <EditableGrid<Prop> api={props} rows={rows} columns={columns} editable={canEdit} minWidth={1300}
          newRow={() => ({ production_id: production.id, name: "", status: "Needed", quantity: 1 })} />
      </div>
    </>
  );
}

const STATUS_TONE: Record<string, string> = {
  Needed: "bg-red-100 text-red-800", Sourcing: "bg-amber-100 text-amber-800", "Rehearsal prop": "bg-sky-100 text-sky-800",
  "Show-ready": "bg-green-100 text-green-800", Repair: "bg-orange-100 text-orange-800", Cut: "bg-paper text-ink-mute",
};

function PropCard({ p, editable, onPatch, onDelete }: { p: Prop; editable: boolean; onPatch: (x: Partial<Prop>) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const next = PROP_STATUSES[(PROP_STATUSES.indexOf(p.status ?? "") + 1) % PROP_STATUSES.length];
  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-2">
        <button className="min-w-0 text-left" onClick={() => setOpen(!open)}>
          <p className="font-semibold">{p.name || "Untitled prop"}{p.quantity && p.quantity > 1 ? ` ×${p.quantity}` : ""}</p>
          <p className="text-xs text-ink-mute">{[p.scene, p.character, p.preset].filter(Boolean).join(" · ") || "Tap to add details"}</p>
        </button>
        <button disabled={!editable} onClick={() => onPatch({ status: next })} title={`Tap → ${next}`}
          className={cx("chip shrink-0 py-1", STATUS_TONE[p.status ?? ""] ?? "bg-paper text-ink-mute")}>{p.status ?? "—"}</button>
      </div>
      {open && editable && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <InlineInput className="col-span-2" value={p.name} placeholder="Prop" onSave={(v) => onPatch({ name: v })} />
          <InlineInput value={p.scene} placeholder="Used in" onSave={(v) => onPatch({ scene: v || null })} />
          <InlineInput value={p.character} placeholder="Handled by" onSave={(v) => onPatch({ character: v || null })} />
          <InlineInput value={p.preset} placeholder="Preset (SL table…)" onSave={(v) => onPatch({ preset: v || null })} />
          <InlineInput value={p.source} placeholder="Source" onSave={(v) => onPatch({ source: v || null })} />
          <InlineInput className="col-span-2" value={p.notes} placeholder="Notes" onSave={(v) => onPatch({ notes: v || null })} />
          <ConfirmButton onConfirm={onDelete}>Delete</ConfirmButton>
        </div>
      )}
    </div>
  );
}
