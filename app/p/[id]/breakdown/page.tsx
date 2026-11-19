"use client";
import { useEffect, useMemo, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { ConfirmButton, PageHeader, Tabs } from "@/components/ui";
import { notify } from "@/lib/notify";
import { EditableGrid } from "@/components/EditableGrid";
import { BREAKDOWN_COLUMNS, Matrix, sceneChartData } from "@/components/breakdown";
import { ExportMenu } from "@/components/export/ExportMenu";
import { useRows } from "@/lib/useRows";
import { fetchAll } from "@/lib/fetchAll";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { SceneRow, Script, ScriptLine } from "@/lib/types";

type View = "table" | "chart" | "script";

export default function BreakdownPage() {
  const { production, canEdit } = useProduction();
  const scenes = useRows<SceneRow>("scenes", production.id, { order: [{ column: "sort_order" }, { column: "created_at" }] });
  const [view, setView] = useState<View>("table");
  return (
    <>
      <PageHeader help="breakdown"
        title="Scene Breakdown"
        subtitle="French scenes / units with who's on, entrances, exits, props and every department, plus character charts."
        actions={
          <>
            <Tabs value={view} onChange={setView} items={[{ value: "table", label: "Breakdown" }, { value: "chart", label: "Scene chart" }, { value: "script", label: "From script" }]} />
            <ExportMenu kind={view === "table" ? "breakdown" : "scenechart"} productionId={production.id} />
          </>
        }
      />
      {view === "table" && canEdit && scenes.rows.length > 0 && (
        <div className="no-print mb-2 flex justify-end">
          <ConfirmButton label={`Delete all ${scenes.rows.length} rows?`} onConfirm={async () => {
            const { error } = await supabaseBrowser().from("scenes").delete().eq("production_id", production.id);
            if (error) return notify.error(error.message);
            scenes.setRows([]);
            notify.deleted("Scene breakdown", `${scenes.rows.length} rows`);
          }}>Clear all rows</ConfirmButton>
        </div>
      )}
      {view === "table" && (
        <EditableGrid<SceneRow>
          api={scenes}
          columns={BREAKDOWN_COLUMNS}
          editable={canEdit}
          minWidth={2400}
          groupBy={(r) => r.act ?? ""}
          newRow={() => {
            const last = scenes.rows[scenes.rows.length - 1];
            return { production_id: production.id, act: last?.act ?? "ACT 1" };
          }}
        />
      )}
      {view === "chart" && <SceneChart scenes={scenes.rows} />}
      {view === "script" && <ScriptChart />}
    </>
  );
}

function SceneChart({ scenes }: { scenes: SceneRow[] }) {
  const { characters } = useProduction();
  const names = characters.rows.map((c) => c.name);
  const { cols, grid } = useMemo(() => sceneChartData(scenes, names), [scenes, names]);
  if (!names.length) return <p className="text-sm text-ink-mute">Add characters in Company &amp; Cast to build the chart.</p>;
  return <Matrix cols={cols.map((c) => ({ label: c.label, sub: c.page ? `pg. ${c.page}` : "" }))} grid={grid} />;
}

function ScriptChart() {
  const { production } = useProduction();
  const [lines, setLines] = useState<ScriptLine[] | null>(null);
  const [by, setBy] = useState<"scene" | "page">("scene");
  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser().from("scripts").select("*").eq("production_id", production.id).eq("is_current", true).limit(1);
      const s = (data as Script[] | null)?.[0];
      setLines(s ? await fetchAll<ScriptLine>("script_lines", "script_id", s.id, "idx") : []);
    })();
  }, [production.id]);

  const { cols, grid } = useMemo(() => {
    if (!lines) return { cols: [], grid: [] };
    const keys: string[] = [];
    const sub: Record<string, string> = {};
    const map = new Map<string, Set<string>>();
    lines.forEach((l) => {
      const k = by === "page" ? `pg. ${l.page}` : [l.act, l.scene].filter(Boolean).join(" · ") || "—";
      if (!map.has(k)) { map.set(k, new Set()); keys.push(k); sub[k] = by === "page" ? "" : `pg. ${l.page}`; }
      if (l.speaker && (l.kind === "dialogue" || l.kind === "character")) map.get(k)!.add(l.speaker);
    });
    const speakers = Array.from(new Set(lines.map((l) => l.speaker).filter(Boolean) as string[])).sort();
    return {
      cols: keys.map((k) => ({ label: k, sub: sub[k] })),
      grid: speakers.map((s) => ({ name: s, cells: keys.map((k) => map.get(k)!.has(s)) })),
    };
  }, [lines, by]);

  if (!lines) return <p className="text-sm text-ink-mute">Loading script…</p>;
  if (!lines.length) return <p className="text-sm text-ink-mute">Import a script first (Script page).</p>;
  return (
    <>
      <div className="mb-2"><Tabs value={by} onChange={setBy} items={[{ value: "scene", label: "By scene" }, { value: "page", label: "By page" }]} /></div>
      <p className="mb-2 text-xs text-ink-mute">Built from who has lines. Silent presence on stage is not detected; use the breakdown table for that.</p>
      <Matrix cols={cols} grid={grid} />
    </>
  );
}

