"use client";
import type { GridColumn } from "@/components/EditableGrid";
import type { SceneRow } from "@/lib/types";
import { cx } from "@/lib/utils";

export const BREAKDOWN_COLUMNS: GridColumn<SceneRow>[] = [
  { key: "act", label: "Act", width: 70 },
  { key: "unit", label: "Unit", width: 80 },
  { key: "french_scene", label: "French scene", width: 140, type: "multiline" },
  { key: "page", label: "Page", width: 70 },
  { key: "setting", label: "Setting / Action", width: 220, type: "multiline" },
  { key: "characters", label: "Characters", width: 180, type: "multiline" },
  { key: "entrances", label: "Entrance", width: 150, type: "multiline" },
  { key: "exits", label: "Exit", width: 150, type: "multiline" },
  { key: "props", label: "Props", width: 180, type: "multiline" },
  { key: "set_notes", label: "Set", width: 160, type: "multiline" },
  { key: "sound", label: "Sound", width: 150, type: "multiline" },
  { key: "lights", label: "Lights", width: 150, type: "multiline" },
  { key: "video", label: "Video", width: 140, type: "multiline" },
  { key: "costume", label: "Costume", width: 140, type: "multiline" },
  { key: "movement", label: "Movement", width: 140, type: "multiline" },
  { key: "remarks", label: "Remarks", width: 160, type: "multiline" },
];

/** Characters × scenes from the breakdown table. */
export function sceneChartData(scenes: SceneRow[], names: string[]) {
  const cols = scenes.map((s, i) => ({ id: s.id, label: [s.unit, s.french_scene?.split("\n")[0]].filter(Boolean).join(" · ") || `#${i + 1}`, page: s.page, act: s.act }));
  const has = (s: SceneRow, n: string) => {
    const pool = `${s.characters ?? ""}`.toLowerCase();
    return pool.split(/[,\n/;]+/).map((x) => x.trim()).some((x) => x && (x === n.toLowerCase() || x.startsWith(n.toLowerCase())));
  };
  const grid = names.map((n) => ({ name: n, cells: scenes.map((s) => has(s, n)) }));
  return { cols, grid };
}

export function Matrix({ cols, grid }: { cols: { label: string; sub?: string }[]; grid: { name: string; cells: boolean[] }[] }) {
  return (
    <div className="card overflow-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 border-b border-r border-paper-line bg-paper px-2 py-1 text-left">Character</th>
            {cols.map((c, i) => (
              <th key={i} className="sticky top-0 z-10 h-28 min-w-[28px] border-b border-r border-paper-line bg-paper align-bottom">
                <div className="mx-auto w-5 whitespace-nowrap text-[10px] font-semibold [writing-mode:vertical-rl] rotate-180">{c.label}{c.sub ? ` (${c.sub})` : ""}</div>
              </th>
            ))}
            <th className="sticky top-0 border-b border-paper-line bg-paper px-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {grid.map((r) => (
            <tr key={r.name}>
              <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-paper-line bg-white px-2 py-1 font-medium">{r.name}</td>
              {r.cells.map((on, i) => <td key={i} className={cx("border-b border-r border-paper-line text-center", on && "bg-cue/80 text-white")}>{on ? "●" : ""}</td>)}
              <td className="border-b border-paper-line px-2 text-center font-semibold">{r.cells.filter(Boolean).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
