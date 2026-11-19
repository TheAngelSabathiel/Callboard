"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { Tabs } from "@/components/ui";
import { LINE_ISSUES, NOTE_DEPTS, addLineNote, addNote, addProp, addTask } from "@/lib/capture";
import { cx, todayISO } from "@/lib/utils";

export type CaptureMode = "note" | "prop" | "line" | "task";
export type QuickCaptureHandle = { focus: () => void };

const remember = (k: string, v?: string) => {
  try { if (v === undefined) return localStorage.getItem(k) ?? ""; localStorage.setItem(k, v); } catch { /* ignore */ }
  return "";
};

/**
 * One-box capture for the rehearsal room. Enter saves, the box clears, focus stays,
 * so the SM can keep logging without touching the mouse.
 */
export const QuickCapture = forwardRef<QuickCaptureHandle, {
  date?: string; modes?: CaptureMode[]; initial?: CaptureMode; compact?: boolean; onSaved?: () => void;
}>(function QuickCapture({ date = todayISO(), modes = ["note", "prop", "line", "task"], initial, compact, onSaved }, ref) {
  const { production, characters, members, isHead, me, userId, canEdit } = useProduction();
  const [mode, setMode] = useState<CaptureMode>(initial ?? modes[0]);
  const [text, setText] = useState("");
  const [dept, setDept] = useState("summary");
  const [flag, setFlag] = useState(false);
  const [scene, setScene] = useState("");
  const [who, setWho] = useState("");
  const [issue, setIssue] = useState(LINE_ISSUES[0]);
  const [page, setPage] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => box.current?.focus() }));
  useEffect(() => { const d = remember("cb-dept"); if (d) setDept(d); }, []);
  useEffect(() => { if (!isHead) setAssignee(me?.id ?? ""); }, [isHead, me?.id]);

  if (!canEdit) return <p className="text-sm text-ink-mute">Only the SM team can log notes.</p>;

  const charNames = characters.rows.map((c) => c.name);

  async function save() {
    if (busy) return;
    const t = text.trim();
    if (mode !== "line" && !t) return;
    if (mode === "line" && !who) return;
    setBusy(true);
    let ok = false;
    if (mode === "note") ok = await addNote(production.id, date, dept, t, flag);
    if (mode === "prop") ok = await addProp(production.id, date, { name: t, scene, character: who });
    if (mode === "line") ok = await addLineNote(production.id, { date, character: who, page, issue, note: t });
    if (mode === "task") ok = await addTask(production.id, { title: t, assignee_id: assignee || null, userId });
    setBusy(false);
    if (ok) { setText(""); setFlag(false); if (mode === "line") setPage(""); onSaved?.(); box.current?.focus(); }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
  };

  const chip = (active: boolean) => cx("rounded-full border px-2.5 py-1 text-xs font-medium", active ? "border-ink bg-ink text-white" : "border-paper-line bg-white text-ink-soft hover:bg-paper");

  return (
    <div className="space-y-2">
      {modes.length > 1 && (
        <Tabs value={mode} onChange={(m) => { setMode(m); setTimeout(() => box.current?.focus(), 0); }}
          items={modes.map((m) => ({ value: m, label: m === "note" ? "Note" : m === "prop" ? "+ Prop" : m === "line" ? "Line note" : "Task" }))} />
      )}

      {mode === "note" && (
        <div className="flex flex-wrap gap-1">
          {NOTE_DEPTS.map((d) => <button key={d.key} type="button" className={chip(dept === d.key)} onClick={() => { setDept(d.key); remember("cb-dept", d.key); box.current?.focus(); }}>{d.label}</button>)}
          <button type="button" className={cx(chip(flag), flag && "border-cue bg-cue")} onClick={() => setFlag(!flag)} title="Flag for department follow-up">⚑ Follow up</button>
        </div>
      )}

      {(mode === "line" || mode === "prop") && charNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mode === "prop" && <span className="self-center text-[11px] text-ink-mute">Handled by:</span>}
          {charNames.map((n) => <button key={n} type="button" className={chip(who === n)} onClick={() => { setWho(who === n ? "" : n); box.current?.focus(); }}>{n}</button>)}
        </div>
      )}
      {mode === "line" && (
        <div className="flex flex-wrap gap-1">
          {LINE_ISSUES.map((i) => <button key={i} type="button" className={chip(issue === i)} onClick={() => setIssue(i)}>{i}</button>)}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {mode === "line" && <input className="input sm:w-20" placeholder="Pg" inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value)} onKeyDown={onKey} />}
        {mode === "prop" && <input className="input sm:w-40" placeholder="Used in (pg / unit)" value={scene} onChange={(e) => setScene(e.target.value)} onKeyDown={onKey} />}
        {mode === "task" && (
          <select className="input sm:w-44" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            {isHead && <option value="">Unassigned</option>}
            {(isHead ? members.rows : members.rows.filter((m) => m.id === me?.id)).map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
        )}
        <textarea
          ref={(el) => { box.current = el; }}
          rows={compact ? 1 : 2}
          className="input flex-1 text-base sm:text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            mode === "note" ? `Note for ${NOTE_DEPTS.find((d) => d.key === dept)?.label}… (Enter to save)`
              : mode === "prop" ? "Prop name, e.g. Tray with 1 chocolate pot"
              : mode === "line" ? (who ? `What ${who} said (optional)` : "Pick a character first")
              : "Task, e.g. Ask costume about Pepang's shawl"
          }
        />
        <button className="btn btn-primary sm:self-stretch" disabled={busy || (mode === "line" ? !who : !text.trim())} onClick={save}>{busy ? "…" : "Save"}</button>
      </div>
    </div>
  );
});
