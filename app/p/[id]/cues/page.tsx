"use client";
import { useMemo, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { ConfirmButton, PageHeader } from "@/components/ui";
import { EditableGrid, type GridColumn } from "@/components/EditableGrid";
import { ExportMenu } from "@/components/export/ExportMenu";
import { useRows } from "@/lib/useRows";
import { CUE_DEPTS, deptColor } from "@/lib/scriptParse";
import type { Cue } from "@/lib/types";
import { cx } from "@/lib/utils";

export default function CuesPage() {
  const { production, canEdit } = useProduction();
  const cues = useRows<Cue>("cues", production.id, { order: [{ column: "sort_key" }, { column: "created_at" }] });
  const [dept, setDept] = useState<string>("");
  const [hideCut, setHideCut] = useState(true);
  const rows = useMemo(() => cues.rows.filter((c) => (!dept || c.dept === dept) && (!hideCut || c.status !== "cut")), [cues.rows, dept, hideCut]);

  const columns: GridColumn<Cue>[] = [
    { key: "dept", label: "Dept", width: 80, type: "select", options: CUE_DEPTS.map((d) => ({ value: d.value, label: d.value })) },
    { key: "number", label: "Cue #", width: 70 },
    { key: "page", label: "Pg", width: 56 },
    { key: "act", label: "Act", width: 70 },
    { key: "scene", label: "Scene / Unit", width: 100 },
    { key: "trigger", label: "GO on (line / visual / sound)", width: 260, type: "multiline" },
    { key: "description", label: "Description / look", width: 220, type: "multiline" },
    { key: "duration", label: "Time", width: 70 },
    { key: "notes", label: "Notes", width: 160, type: "multiline" },
    { key: "status", label: "Status", width: 90, type: "select", options: [{ value: "draft", label: "Draft" }, { value: "set", label: "Set" }, { value: "cut", label: "Cut" }] },
  ];

  async function renumber() {
    if (!dept) return;
    const list = cues.rows.filter((c) => c.dept === dept && c.status !== "cut");
    for (let i = 0; i < list.length; i++) if (list[i].number !== String(i + 1)) await cues.update(list[i].id, { number: String(i + 1) });
  }

  const counts = CUE_DEPTS.map((d) => ({ ...d, n: cues.rows.filter((c) => c.dept === d.value && c.status !== "cut").length }));
  const maxKey = cues.rows.length ? Math.max(...cues.rows.map((c) => Number(c.sort_key))) : 0;

  return (
    <>
      <PageHeader help="cues"
        title="Cue Sheet"
        subtitle="Every cue by department in running order. Cues placed in the Script page appear here with their page and GO line."
        actions={<ExportMenu kind="cues" productionId={production.id} params={dept ? { dept } : {}} />}
      />
      <div className="no-print mb-3 flex flex-wrap items-center gap-1">
        <button onClick={() => setDept("")} className={cx("rounded px-2 py-1 text-xs font-bold", !dept ? "bg-ink text-white" : "bg-white ring-1 ring-paper-line")}>All · {cues.rows.filter((c) => c.status !== "cut").length}</button>
        {counts.map((d) => (
          <button key={d.value} onClick={() => setDept(d.value)} className={cx("rounded px-2 py-1 text-xs font-bold", dept === d.value ? "text-white" : "bg-white ring-1 ring-paper-line")}
            style={dept === d.value ? { background: d.color } : { color: d.color }}>{d.value} · {d.n}</button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={hideCut} onChange={(e) => setHideCut(e.target.checked)} /> Hide cut</label>
        {canEdit && dept && <ConfirmButton onConfirm={renumber} label={`Renumber ${dept} 1…n?`}>Renumber {dept}</ConfirmButton>}
      </div>
      <EditableGrid<Cue>
        api={cues}
        rows={rows}
        columns={[{ key: "id", label: "", width: 8, render: (c) => <i className="block h-5 w-1.5 rounded" style={{ background: deptColor(c.dept) }} /> }, ...columns]}
        editable={canEdit}
        orderKey="sort_key"
        minWidth={1200}
        groupBy={(c) => c.act ?? ""}
        newRow={() => ({ production_id: production.id, dept: dept || "LX", number: "", sort_key: maxKey + 1, status: "draft" })}
      />
    </>
  );
}
