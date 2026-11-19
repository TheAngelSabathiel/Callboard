"use client";
import { notify } from "@/lib/notify";
import { useEffect, useRef, useState } from "react";
import { addProp } from "@/lib/capture";
import { todayISO } from "@/lib/utils";
import { useProduction } from "@/components/production/ProductionProvider";
import { ConfirmButton, ErrorNote, Field, Tabs } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { useRows } from "@/lib/useRows";
import { BLOCKING_SHORTHAND, CUE_DEPTS, HIGHLIGHTS, deptColor } from "@/lib/scriptParse";
import type { Cue, LineKind, Script, ScriptLine, ScriptMark } from "@/lib/types";
import { cx } from "@/lib/utils";

type Tab = "blocking" | "note" | "cue" | "edit";

export function LinePanel({ line, script, marks, marksApi, cues, lines, onLineChange, onReload, onClose, onNext }: {
  line: ScriptLine; script: Script; marks: ScriptMark[];
  marksApi: ReturnType<typeof useRows<ScriptMark>>; cues: ReturnType<typeof useRows<Cue>>;
  lines: ScriptLine[]; onLineChange: (p: Partial<ScriptLine>) => void; onReload: () => void; onClose: () => void; onNext?: () => void;
}) {
  const { production, canEdit, userId, characters } = useProduction();
  const [advance, setAdvance] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { try { setAdvance(localStorage.getItem("cb-advance") === "1"); } catch { /* ignore */ } }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  // keep the cursor in the box when moving line to line
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) ta.current?.focus({ preventScroll: true });
  }, [line.id]);
  const [tab, setTab] = useState<Tab>("blocking");
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const lineCues = cues.rows.filter((c) => c.line_id === line.id || c.standby_line_id === line.id);

  useEffect(() => { setText(""); setErr(null); }, [line.id, tab]);

  async function addMark(type: ScriptMark["type"], body: string | null, color?: string) {
    try {
      await marksApi.insert({ script_id: script.id, production_id: production.id, line_id: line.id, type, text: body, color: color ?? null, created_by: userId });
      setText("");
      if (advance && type === "blocking") onNext?.();
    } catch (e) { setErr((e as Error).message); }
  }

  const highlight = marks.find((m) => m.type === "highlight");
  const listed = marks.filter((m) => m.type !== "highlight");

  return (
    <div className="card fixed inset-x-0 bottom-0 z-40 max-h-[60vh] overflow-y-auto rounded-b-none border-t-2 border-cue p-3 shadow-2xl lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:rounded-lg lg:border-t lg:shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-mute">pg. {line.page}{line.act ? ` · ${line.act}` : ""}{line.scene ? ` · ${line.scene}` : ""} · line {line.idx + 1}</p>
          <p className="line-clamp-2 font-script text-sm">{line.speaker ? <b>{line.speaker}: </b> : null}{line.text}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      {listed.length > 0 && (
        <ul className="mb-3 space-y-1">
          {listed.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-2 rounded bg-paper px-2 py-1 text-xs">
              <span><b className={m.type === "blocking" ? "text-blue-800" : m.type === "line_change" ? "text-red-700" : "text-stby"}>{m.type === "blocking" ? "Blocking" : m.type === "line_change" ? "Line change" : "Note"}:</b> {m.text}</span>
              {canEdit && <ConfirmButton onConfirm={() => marksApi.remove(m.id)}>✕</ConfirmButton>}
            </li>
          ))}
        </ul>
      )}
      {lineCues.length > 0 && (
        <ul className="mb-3 space-y-1">
          {lineCues.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs text-white" style={{ background: deptColor(c.dept) }}>
              <span><b>{c.standby_line_id === line.id && c.line_id !== line.id ? "Standby " : "GO "}{c.dept} {c.number}</b>{c.description ? ` · ${c.description}` : ""}{c.duration ? ` · ${c.duration}` : ""}</span>
              {canEdit && c.line_id === line.id && <button className="text-white/80 hover:text-white" onClick={() => cues.remove(c.id)}>✕</button>}
            </li>
          ))}
        </ul>
      )}

      {!canEdit ? <p className="text-xs text-ink-mute">Read only. The SM team edits blocking and cues.</p> : (
        <>
          <Tabs value={tab} onChange={setTab} items={[{ value: "blocking", label: "Blocking" }, { value: "note", label: "Note" }, { value: "cue", label: "Cue" }, { value: "edit", label: "Edit" }]} />
          <div className="mt-3">
            {tab === "blocking" && (
              <>
                {characters.rows.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {characters.rows.map((c) => {
                      const short = c.name.split(/[ /]/)[0];
                      return <button key={c.id} className="rounded bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-ink-soft" onClick={() => { setText((t) => (t ? `${t} ${short}` : short)); ta.current?.focus(); }}>{short}</button>;
                    })}
                  </div>
                )}
                <div className="mb-2 flex flex-wrap gap-1">
                  {BLOCKING_SHORTHAND.map((s) => (
                    <button key={s} className="rounded border border-paper-line bg-white px-1.5 py-0.5 text-[11px] hover:bg-paper" onClick={() => { setText((t) => (t ? `${t} ${s}` : s)); ta.current?.focus(); }}>{s}</button>
                  ))}
                </div>
                <textarea ref={ta} className="input text-base sm:text-sm" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Bitoy X DSL to table, sits" autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && text.trim()) { e.preventDefault(); addMark("blocking", text.trim()); } }} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={() => addMark("blocking", text.trim())}>Add blocking</button>
                  <button className="btn btn-sm" onClick={() => onNext?.()}>Next line ↓</button>
                  <label className="flex items-center gap-1 text-xs text-ink-soft">
                    <input type="checkbox" checked={advance} onChange={(e) => { setAdvance(e.target.checked); try { localStorage.setItem("cb-advance", e.target.checked ? "1" : "0"); } catch { /* ignore */ } }} />
                    Enter = save + next line
                  </label>
                </div>
              </>
            )}
            {tab === "note" && (
              <>
                <textarea ref={ta} className="input text-base sm:text-sm" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tray with 1 chocolate pot" autoFocus />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={() => addMark("note", text.trim())}>Add note</button>
                  <button className="btn btn-cue btn-sm" disabled={!text.trim()} title="Adds to Props Tracker as Needed, with this page"
                    onClick={async () => {
                      const name = text.trim();
                      if (await addProp(production.id, todayISO(), { name, scene: `pg. ${line.page}${line.scene ? ` · ${line.scene}` : ""}`, character: line.speaker ?? undefined })) {
                        await addMark("note", `Prop: ${name}`);
                      }
                    }}>+ Prop</button>
                  <button className="btn btn-sm" disabled={!text.trim()} onClick={() => addMark("line_change", text.trim())}>Log line change</button>
                </div>
                <p className="label mt-3">Highlight</p>
                <div className="flex gap-1">
                  {HIGHLIGHTS.map((c) => (
                    <button key={c} className={cx("h-7 w-7 rounded border", highlight?.color === c && "ring-2 ring-ink")} style={{ background: c }}
                      onClick={async () => { if (highlight) await marksApi.remove(highlight.id); if (highlight?.color !== c) await addMark("highlight", null, c); }} />
                  ))}
                  {highlight && <button className="btn btn-ghost btn-sm" onClick={() => marksApi.remove(highlight.id)}>None</button>}
                </div>
              </>
            )}
            {tab === "cue" && <CueForm line={line} script={script} cues={cues} lines={lines} />}
            {tab === "edit" && <EditLine line={line} onLineChange={onLineChange} onReload={onReload} />}
            <ErrorNote msg={err} />
          </div>
        </>
      )}
    </div>
  );
}

function nextNumber(cues: Cue[], dept: string) {
  const nums = cues.filter((c) => c.dept === dept).map((c) => parseFloat(c.number)).filter((n) => !Number.isNaN(n));
  return nums.length ? String(Math.floor(Math.max(...nums)) + 1) : "1";
}

function CueForm({ line, script, cues, lines }: { line: ScriptLine; script: Script; cues: ReturnType<typeof useRows<Cue>>; lines: ScriptLine[] }) {
  const { production } = useProduction();
  const [dept, setDept] = useState("LX");
  const [number, setNumber] = useState(() => nextNumber(cues.rows, "LX"));
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [standbyBack, setStandbyBack] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setNumber(nextNumber(cues.rows, dept)); }, [dept, cues.rows]);

  async function add() {
    const i = lines.findIndex((l) => l.id === line.id);
    let sbLine: ScriptLine | undefined;
    if (standbyBack > 0) {
      let k = i, n = 0;
      while (k > 0 && n < standbyBack) { k--; if (lines[k].kind !== "blank") n++; }
      sbLine = lines[k];
    }
    const sameLine = cues.rows.filter((c) => c.line_id === line.id).length;
    try {
      await cues.insert({
        production_id: production.id, script_id: script.id, line_id: line.id, standby_line_id: sbLine?.id ?? null,
        dept, number, page: String(line.page), act: line.act, scene: line.scene,
        trigger: (line.speaker ? `${line.speaker}: ` : "") + line.text.slice(0, 80),
        description: description || null, duration: duration || null, sort_key: line.idx + sameLine * 0.01, status: "draft",
      });
      setDescription(""); setDuration("");
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {CUE_DEPTS.map((d) => (
          <button key={d.value} onClick={() => setDept(d.value)} className={cx("rounded px-2 py-0.5 text-xs font-bold", dept === d.value ? "text-white" : "bg-white text-ink-soft ring-1 ring-paper-line")}
            style={dept === d.value ? { background: d.color } : undefined}>{d.value}</button>
        ))}
      </div>
      <div className="grid grid-cols-[90px_1fr] gap-2">
        <Field label="Number"><input className="input" value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
        <Field label="Time / count"><input className="input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="5s fade" /></Field>
      </div>
      <Field label="Description"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Warm special on altar" /></Field>
      <Field label="Standby">
        <select className="input" value={standbyBack} onChange={(e) => setStandbyBack(Number(e.target.value))}>
          <option value={0}>No standby mark</option>
          {[1, 2, 3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} line{n > 1 ? "s" : ""} before</option>)}
        </select>
      </Field>
      <ErrorNote msg={err} />
      <button className="btn btn-cue btn-sm" onClick={add} disabled={!number}>GO here: {dept} {number}</button>
    </div>
  );
}

function EditLine({ line, onLineChange, onReload }: { line: ScriptLine; onLineChange: (p: Partial<ScriptLine>) => void; onReload: () => void }) {
  const [f, setF] = useState({ text: line.text, speaker: line.speaker ?? "", kind: line.kind, page: line.page });
  const [newText, setNewText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setF({ text: line.text, speaker: line.speaker ?? "", kind: line.kind, page: line.page }), [line]);

  async function save() {
    const patch = { text: f.text, speaker: f.speaker ? f.speaker.toUpperCase() : null, kind: f.kind, page: Number(f.page) || line.page };
    const { error } = await supabaseBrowser().from("script_lines").update(patch).eq("id", line.id);
    if (error) setErr(error.message); else { onLineChange(patch); notify.saved("Script line"); }
  }
  async function insertAfter() {
    const { error } = await supabaseBrowser().rpc("script_insert_line", { p_script: line.script_id, p_after: line.idx, p_text: newText, p_kind: "dialogue", p_speaker: null });
    if (error) setErr(error.message); else { setNewText(""); onReload(); notify.created("Script line", newText); }
  }
  async function del() {
    const { error } = await supabaseBrowser().from("script_lines").delete().eq("id", line.id);
    if (error) setErr(error.message); else { onReload(); notify.deleted("Script line", line.text.slice(0, 60)); }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Speaker" className="col-span-2"><input className="input" value={f.speaker} onChange={(e) => setF({ ...f, speaker: e.target.value })} /></Field>
        <Field label="Page"><input className="input" type="number" value={f.page} onChange={(e) => setF({ ...f, page: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Type">
        <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as LineKind })}>
          {(["dialogue", "direction", "heading", "character"] as LineKind[]).map((k) => <option key={k}>{k}</option>)}
        </select>
      </Field>
      <Field label="Text"><textarea className="input font-script" rows={3} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
      <button className="btn btn-primary btn-sm" onClick={save}>Save line</button>
      <div className="border-t border-paper-line pt-2">
        <Field label="Insert new line after"><textarea className="input font-script" rows={2} value={newText} onChange={(e) => setNewText(e.target.value)} /></Field>
        <div className="mt-2 flex justify-between">
          <button className="btn btn-sm" disabled={!newText.trim()} onClick={insertAfter}>Insert</button>
          <ConfirmButton onConfirm={del} label="Delete line + its marks?">Delete line</ConfirmButton>
        </div>
      </div>
      <ErrorNote msg={err} />
    </div>
  );
}
