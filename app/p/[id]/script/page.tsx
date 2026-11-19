"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { Empty, PageHeader } from "@/components/ui";
import { ImportScript } from "@/components/script/ImportScript";
import { LinePanel } from "@/components/script/LinePanel";
import { ExportMenu } from "@/components/export/ExportMenu";
import { useRows } from "@/lib/useRows";
import { fetchAll } from "@/lib/fetchAll";
import { CUE_DEPTS, deptColor } from "@/lib/scriptParse";
import type { Cue, Script, ScriptLine, ScriptMark } from "@/lib/types";
import { cx } from "@/lib/utils";

export default function ScriptPage() {
  const { production, canEdit } = useProduction();
  const scripts = useRows<Script>("scripts", production.id, { order: [{ column: "created_at", ascending: false }], realtime: false });
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [lines, setLines] = useState<ScriptLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hit, setHit] = useState(0);
  const [speaker, setSpeaker] = useState("");
  const [show, setShow] = useState({ blocking: true, note: true, cues: true });
  const [depts, setDepts] = useState<string[]>(CUE_DEPTS.map((d) => d.value));
  const [size, setSize] = useState(15);
  const [outline, setOutline] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const script = scripts.rows.find((s) => s.id === scriptId) ?? null;
  useEffect(() => {
    if (!scriptId && scripts.rows.length) setScriptId((scripts.rows.find((s) => s.is_current) ?? scripts.rows[0]).id);
  }, [scripts.rows, scriptId]);

  const loadLines = useCallback(async (id: string) => {
    setLoadingLines(true);
    setLines(await fetchAll<ScriptLine>("script_lines", "script_id", id, "idx"));
    setLoadingLines(false);
  }, []);
  useEffect(() => { if (scriptId) loadLines(scriptId); }, [scriptId, loadLines]);

  const marks = useRows<ScriptMark>("script_marks", scriptId, { column: "script_id", order: [{ column: "created_at" }], enabled: !!scriptId });
  const cues = useRows<Cue>("cues", production.id, { order: [{ column: "sort_key" }] });

  const marksByLine = useMemo(() => {
    const m = new Map<string, ScriptMark[]>();
    marks.rows.forEach((x) => m.set(x.line_id, [...(m.get(x.line_id) ?? []), x]));
    return m;
  }, [marks.rows]);
  const cuesByLine = useMemo(() => {
    const go = new Map<string, Cue[]>(), sb = new Map<string, Cue[]>();
    cues.rows.filter((c) => c.status !== "cut" && depts.includes(c.dept)).forEach((c) => {
      if (c.line_id) go.set(c.line_id, [...(go.get(c.line_id) ?? []), c]);
      if (c.standby_line_id) sb.set(c.standby_line_id, [...(sb.get(c.standby_line_id) ?? []), c]);
    });
    return { go, sb };
  }, [cues.rows, depts]);

  const pages = useMemo(() => {
    const m = new Map<number, ScriptLine[]>();
    lines.forEach((l) => m.set(l.page, [...(m.get(l.page) ?? []), l]));
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [lines]);

  const outlineItems = useMemo(() => {
    const out: { label: string; page: number; id: string; level: number }[] = [];
    lines.forEach((l) => { if (l.kind === "heading") out.push({ label: l.text, page: l.page, id: l.id, level: /^\s*act|akto|yugto/i.test(l.text) ? 0 : 1 }); });
    return out;
  }, [lines]);

  const speakers = useMemo(() => Array.from(new Set(lines.map((l) => l.speaker).filter(Boolean) as string[])).sort(), [lines]);
  const speakerPages = useMemo(() => speaker ? Array.from(new Set(lines.filter((l) => l.speaker === speaker && l.kind === "dialogue").map((l) => l.page))) : [], [lines, speaker]);

  const hits = useMemo(() => {
    if (q.trim().length < 2) return [] as string[];
    const n = q.toLowerCase();
    return lines.filter((l) => l.text.toLowerCase().includes(n) || (l.speaker ?? "").toLowerCase().includes(n)).map((l) => l.id);
  }, [q, lines]);
  const hitSet = useMemo(() => new Set(hits), [hits]);

  const jumpTo = (id: string) => document.getElementById(`line-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  const jumpPage = (p: number) => document.getElementById(`page-${p}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  useEffect(() => { if (hits.length) jumpTo(hits[Math.min(hit, hits.length - 1)]); }, [hit, hits]);

  // Keyboard: ↑/↓ moves the selected line
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!selected) return;
      if ((e.target as HTMLElement).closest("input,textarea,select") && !e.altKey) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const i = lines.findIndex((l) => l.id === selected);
      const j = i + (e.key === "ArrowDown" ? 1 : -1);
      if (lines[j]) { e.preventDefault(); setSelected(lines[j].id); jumpTo(lines[j].id); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selected, lines]);

  const selLine = lines.find((l) => l.id === selected) ?? null;

  if (!scripts.loading && scripts.rows.length === 0) {
    return (
      <>
        <PageHeader help="script" title="Script" subtitle="Import the script to navigate by act, scene and page, and mark blocking, notes and cues." />
        <Empty title="No script yet">
          {canEdit ? <button className="btn btn-primary mt-2" onClick={() => setImporting(true)}>Import script</button> : "Your SM team hasn't imported the script yet."}
        </Empty>
        {importing && <ImportScript onClose={() => setImporting(false)} onDone={(s) => { setImporting(false); scripts.reload(); setScriptId(s.id); }} />}
      </>
    );
  }

  return (
    <>
      <PageHeader help="script"
        title="Script & Blocking"
        subtitle={script ? `${script.title}${script.version ? ` · ${script.version}` : ""} · ${pages.length} pages` : ""}
        actions={
          <>
            <select className="input w-48" value={scriptId ?? ""} onChange={(e) => { setScriptId(e.target.value); setSelected(null); }}>
              {scripts.rows.map((s) => <option key={s.id} value={s.id}>{s.title}{s.version ? ` (${s.version})` : ""}{s.is_current ? " ★" : ""}</option>)}
            </select>
            {canEdit && <button className="btn" onClick={() => setImporting(true)}>Import new version</button>}
            {scriptId && <ExportMenu kind="promptbook" productionId={production.id} params={{ scriptId }} />}
          </>
        }
      />

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-20 -mx-4 mb-3 flex flex-wrap items-center gap-2 border-b border-paper-line bg-paper/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0">
        <button className="btn btn-sm lg:hidden" onClick={() => setOutline(!outline)}>☰ Outline</button>
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-mute">Page</span>
          <select className="input w-20 py-1 text-xs" onChange={(e) => jumpPage(Number(e.target.value))} value="">
            <option value="">—</option>
            {pages.map(([p]) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <input className="input w-40 py-1 text-xs" placeholder="Search lines…" value={q} onChange={(e) => { setQ(e.target.value); setHit(0); }} />
          {hits.length > 0 && (
            <>
              <span className="text-xs text-ink-mute">{Math.min(hit + 1, hits.length)}/{hits.length}</span>
              <button className="btn btn-sm" onClick={() => setHit((h) => (h - 1 + hits.length) % hits.length)}>‹</button>
              <button className="btn btn-sm" onClick={() => setHit((h) => (h + 1) % hits.length)}>›</button>
            </>
          )}
        </div>
        <select className="input w-40 py-1 text-xs" value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
          <option value="">Highlight character…</option>
          {speakers.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-2 text-xs">
          {(["blocking", "note", "cues"] as const).map((k) => (
            <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{k === "note" ? "Notes" : k[0].toUpperCase() + k.slice(1)}</label>
          ))}
        </div>
        {show.cues && (
          <div className="flex flex-wrap gap-1">
            {CUE_DEPTS.map((d) => (
              <button key={d.value} onClick={() => setDepts(depts.includes(d.value) ? depts.filter((x) => x !== d.value) : [...depts, d.value])}
                className={cx("rounded px-1.5 py-0.5 text-[10px] font-bold", depts.includes(d.value) ? "text-white" : "bg-white text-ink-mute line-through")}
                style={depts.includes(d.value) ? { background: d.color } : undefined}>{d.value}</button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button className="btn btn-sm" onClick={() => setSize((s) => Math.max(11, s - 1))}>A−</button>
          <button className="btn btn-sm" onClick={() => setSize((s) => Math.min(24, s + 1))}>A+</button>
        </div>
        {speaker && speakerPages.length > 0 && (
          <p className="w-full text-xs text-ink-mute">{speaker} speaks on pages: {speakerPages.map((p) => (
            <button key={p} className="mr-1 underline" onClick={() => jumpPage(p)}>{p}</button>
          ))}</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[200px_1fr_320px]">
        {/* Outline */}
        <aside className={cx("no-print lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto", outline ? "block" : "hidden")}>
          <div className="card p-2 text-sm">
            <p className="label px-1">Outline</p>
            {outlineItems.length === 0 && <p className="px-1 text-xs text-ink-mute">No ACT / SCENE / UNIT headings detected.</p>}
            {outlineItems.map((o) => (
              <button key={o.id} onClick={() => { jumpTo(o.id); setOutline(false); }}
                className={cx("flex w-full justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-paper", o.level === 0 ? "font-bold" : "pl-3 text-ink-soft")}>
                <span className="truncate">{o.label}</span><span className="text-xs text-ink-mute">{o.page}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Script */}
        <div ref={scroller} className="min-w-0">
          {loadingLines && <p className="text-sm text-ink-mute">Loading script…</p>}
          {pages.map(([p, plines]) => (
            <section key={p} id={`page-${p}`} className="card mb-4 overflow-hidden" style={{ contentVisibility: "auto", containIntrinsicSize: "1px 900px" }}>
              <div className="flex items-center justify-between border-b border-paper-line bg-paper px-3 py-1 text-xs text-ink-mute">
                <span>{plines[0]?.act ?? ""}{plines[0]?.scene ? ` · ${plines[0].scene}` : ""}</span>
                <span className="font-semibold">pg. {p}</span>
              </div>
              <div className="py-2 font-script" style={{ fontSize: size }}>
                {plines.map((l) => {
                  const lm = marksByLine.get(l.id) ?? [];
                  const hl = lm.find((m) => m.type === "highlight");
                  const blocking = show.blocking ? lm.filter((m) => m.type === "blocking") : [];
                  const notes = show.note ? lm.filter((m) => m.type === "note" || m.type === "line_change") : [];
                  const goCues = show.cues ? cuesByLine.go.get(l.id) ?? [] : [];
                  const sbCues = show.cues ? cuesByLine.sb.get(l.id) ?? [] : [];
                  if (l.kind === "blank") return <div key={l.id} id={`line-${l.id}`} className="h-3" />;
                  return (
                    <div
                      key={l.id}
                      id={`line-${l.id}`}
                      onClick={() => setSelected(l.id)}
                      className={cx(
                        "grid cursor-pointer grid-cols-[52px_1fr] gap-x-2 px-2 py-0.5 sm:grid-cols-[64px_1fr_38%]",
                        selected === l.id ? "bg-cue-soft ring-1 ring-inset ring-cue" : "hover:bg-paper",
                        hitSet.has(l.id) && "outline outline-2 outline-amber-400",
                        speaker && l.speaker === speaker && l.kind === "dialogue" && "border-l-4 border-cue"
                      )}
                      style={hl ? { background: hl.color ?? "#fde68a" } : undefined}
                    >
                      <div className="flex flex-col items-end gap-0.5 pt-0.5 font-sans">
                        {sbCues.map((c) => <span key={`sb-${c.id}`} className="rounded border px-1 text-[9px] font-bold" style={{ borderColor: deptColor(c.dept), color: deptColor(c.dept) }}>stby {c.dept} {c.number}</span>)}
                        {goCues.map((c) => <span key={c.id} className="rounded px-1 text-[10px] font-bold text-white" style={{ background: deptColor(c.dept) }}>{c.dept} {c.number}</span>)}
                      </div>
                      <div className={cx(
                        "min-w-0 whitespace-pre-wrap leading-snug",
                        l.kind === "heading" && "py-1 text-center font-bold uppercase tracking-wide",
                        l.kind === "direction" && "italic text-ink-soft",
                        l.kind === "character" && "pl-[30%] font-bold"
                      )}>
                        {l.kind === "dialogue" && l.speaker && <b className="mr-1">{l.speaker}:</b>}
                        {l.text}
                      </div>
                      <div className="col-span-2 space-y-0.5 pl-[60px] font-sans text-xs sm:col-span-1 sm:pl-0">
                        {blocking.map((m) => <p key={m.id} className="text-blue-800"><b>B:</b> {m.text}</p>)}
                        {notes.map((m) => <p key={m.id} className={m.type === "line_change" ? "text-red-700" : "text-stby"}><b>{m.type === "line_change" ? "Δ" : "N:"}</b> {m.text}</p>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Line panel */}
        <aside className="no-print">
          {selLine ? (
            <LinePanel
              line={selLine}
              script={script!}
              marks={marksByLine.get(selLine.id) ?? []}
              marksApi={marks}
              cues={cues}
              lines={lines}
              onLineChange={(patch) => setLines((cur) => cur.map((l) => (l.id === selLine.id ? { ...l, ...patch } : l)))}
              onReload={() => scriptId && loadLines(scriptId)}
              onClose={() => setSelected(null)}
              onNext={() => {
                const i = lines.findIndex((l) => l.id === selLine.id);
                const nx = lines.slice(i + 1).find((l) => l.kind !== "blank");
                if (nx) { setSelected(nx.id); jumpTo(nx.id); }
              }}
            />
          ) : (
            <div className="card hidden p-4 text-sm text-ink-mute lg:sticky lg:top-24 lg:block">
              Select a line to add blocking, notes, highlights or cues. Use ↑ / ↓ to move between lines.
            </div>
          )}
        </aside>
      </div>

      {importing && <ImportScript onClose={() => setImporting(false)} onDone={(s) => { setImporting(false); scripts.reload(); setScriptId(s.id); }} />}
    </>
  );
}
