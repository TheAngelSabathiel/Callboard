"use client";
import { useMemo, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { cx } from "@/lib/utils";

/** Pick who is called. Shows characters first (maps to actor/alternate), then everyone else. */
export function CalledPicker({ value, all, onChange, disabled }: {
  value: string[]; all: boolean; onChange: (ids: string[], all: boolean) => void; disabled?: boolean;
}) {
  const { members, characters } = useProduction();
  const [q, setQ] = useState("");
  const set = new Set(value);

  const toggle = (id: string | null) => {
    if (!id || disabled) return;
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next), false);
  };

  const others = useMemo(() => {
    const castIds = new Set(characters.rows.flatMap((c) => [c.actor_id, c.alternate_id]).filter(Boolean) as string[]);
    return members.rows.filter((m) => !castIds.has(m.id));
  }, [members.rows, characters.rows]);

  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-[200px] py-1 text-xs" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" disabled={disabled} checked={all} onChange={(e) => onChange(value, e.target.checked)} /> All actors called
        </label>
        {!disabled && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([], false)}>Clear</button>}
      </div>
      {!all && (
        <>
          <div className="flex flex-wrap gap-1">
            {characters.rows.filter((c) => match(c.name)).map((c) => {
              const actor = members.rows.find((m) => m.id === c.actor_id);
              const alt = members.rows.find((m) => m.id === c.alternate_id);
              const onA = !!c.actor_id && set.has(c.actor_id);
              const onB = !!c.alternate_id && set.has(c.alternate_id);
              return (
                <span key={c.id} className={cx("inline-flex overflow-hidden rounded-full border text-xs", onA || onB ? "border-cue" : "border-paper-line")}>
                  <button type="button" disabled={!actor || disabled} onClick={() => toggle(c.actor_id)}
                    className={cx("px-2 py-0.5", onA ? "bg-cue text-white" : "bg-white", !actor && "opacity-50")}
                    title={actor?.display_name ?? "No actor assigned"}>
                    {c.name}
                  </button>
                  {alt && (
                    <button type="button" disabled={disabled} onClick={() => toggle(c.alternate_id)}
                      className={cx("border-l px-1.5 py-0.5", onB ? "bg-cue text-white" : "bg-white text-ink-mute")}
                      title={`Alternate: ${alt.display_name}`}>alt</button>
                  )}
                </span>
              );
            })}
          </div>
          {others.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {others.filter((m) => match(m.display_name + (m.position ?? ""))).map((m) => (
                <button key={m.id} type="button" disabled={disabled} onClick={() => toggle(m.id)}
                  className={cx("rounded-full border px-2 py-0.5 text-xs", set.has(m.id) ? "border-ink bg-ink text-white" : "border-paper-line bg-white text-ink-soft")}>
                  {m.display_name}{m.position ? ` · ${m.position}` : ""}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
