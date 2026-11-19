"use client";
/**
 * Rehearsal-room capture helpers: write a note, prop, line note or task in one
 * step, straight into today's report / trackers, with an Undo toast.
 */
import { supabaseBrowser } from "./supabase/client";
import { notify } from "./notify";
import type { ProdEvent, Report, ReportSection, ReportType } from "./types";
import { fmtTime } from "./utils";

export const NOTE_DEPTS: { key: string; label: string }[] = [
  { key: "summary", label: "General" },
  { key: "director", label: "Director" },
  { key: "script", label: "Script" },
  { key: "props", label: "Props" },
  { key: "set", label: "Set" },
  { key: "costume", label: "Costume" },
  { key: "hmu", label: "Hair & Makeup" },
  { key: "lights", label: "Lights" },
  { key: "sound", label: "Sound" },
  { key: "video", label: "Video" },
  { key: "movement", label: "Movement" },
  { key: "production", label: "Production" },
  { key: "venue", label: "Venue" },
];
const SECTION_TITLE: Record<string, string> = {
  summary: "Rehearsal Summary", director: "Director", script: "Script / Text", props: "Props", set: "Set",
  costume: "Costume", hmu: "Hair & Makeup", lights: "Lights", sound: "Sound / Music", video: "Video / Projection",
  movement: "Choreography / Movement", production: "Production / Management", venue: "Venue / Facilities",
};

export const LINE_ISSUES = ["Dropped line", "Paraphrased", "Wrong word", "Added words", "Jumped cue", "Called for line", "Out of order", "Late entrance"];

const REPORT_FOR: Record<string, ReportType> = { show: "performance", tech: "tech", dress: "tech", meeting: "meeting" };
const cache = new Map<string, string>();

export function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Today's report for this production (creates it, linked to the day's calendar item, if missing). */
export async function ensureReport(pid: string, date: string): Promise<string> {
  const k = `${pid}|${date}`;
  if (cache.has(k)) return cache.get(k)!;
  const sb = supabaseBrowser();
  const { data: existing } = await sb.from("reports").select("id,type,event_id").eq("production_id", pid).eq("date", date).neq("type", "meeting").order("created_at").limit(1);
  let id = (existing as Pick<Report, "id">[] | null)?.[0]?.id;
  if (!id) {
    const { data: evs } = await sb.from("events").select("*").eq("production_id", pid).eq("date", date).order("start_time").limit(1);
    const ev = (evs as ProdEvent[] | null)?.[0];
    const { data, error } = await sb.rpc("create_report", {
      p_production: pid, p_type: ev ? REPORT_FOR[ev.type] ?? "rehearsal" : "rehearsal", p_date: date, p_event: ev?.id ?? null,
    });
    if (error) throw error;
    id = data as string;
    notify.info("Today's report started", "Your notes are collected in Reports.");
  }
  cache.set(k, id);
  return id;
}

/** Append a time-stamped bullet to a report section. Returns an undo function. */
export async function appendNote(pid: string, reportId: string, key: string, text: string, flag = false) {
  const sb = supabaseBrowser();
  const { data } = await sb.from("report_sections").select("*").eq("report_id", reportId).eq("key", key).limit(1);
  let sec = (data as ReportSection[] | null)?.[0];
  if (!sec) {
    const { data: created, error } = await sb.from("report_sections").insert({
      report_id: reportId, production_id: pid, key, title: SECTION_TITLE[key] ?? key, body: "", sort_order: 50,
    }).select("*").single();
    if (error) throw error;
    sec = created as ReportSection;
  }
  const line = `• [${fmtTime(nowHHMM())}] ${text.trim()}`;
  const before = sec.body ?? "";
  const body = before.trim() ? `${before.replace(/\s+$/, "")}\n${line}` : line;
  const { error } = await sb.from("report_sections").update({ body, ...(flag ? { needs_attention: true } : {}) }).eq("id", sec.id);
  if (error) throw error;
  const sid = sec.id;
  return async () => {
    const { data: cur } = await sb.from("report_sections").select("body").eq("id", sid).single();
    const b = (cur as { body: string } | null)?.body ?? "";
    await sb.from("report_sections").update({ body: b.split("\n").filter((l) => l !== line).join("\n") }).eq("id", sid);
  };
}

/** Run with today's report id; if the cached report was deleted meanwhile, recreate once. */
async function withReport<T>(pid: string, date: string, fn: (rid: string) => Promise<T>): Promise<T> {
  try { return await fn(await ensureReport(pid, date)); }
  catch (e) { cache.delete(`${pid}|${date}`); if (String((e as Error).message).match(/foreign key|violates|0 rows|not found/i)) return fn(await ensureReport(pid, date)); throw e; }
}

export async function addNote(pid: string, date: string, key: string, text: string, flag = false) {
  try {
    const undo = await withReport(pid, date, (rid) => appendNote(pid, rid, key, text, flag));
    const dept = NOTE_DEPTS.find((d) => d.key === key)?.label ?? key;
    notify.created(`${dept} note`, text, async () => { await undo(); notify.info("Note removed"); });
    return true;
  } catch (e) { notify.error((e as Error).message); return false; }
}

export async function addProp(pid: string, date: string, p: { name: string; scene?: string; character?: string; notes?: string; logToReport?: boolean }) {
  const sb = supabaseBrowser();
  try {
    const { data: max } = await sb.from("props").select("sort_order").eq("production_id", pid).order("sort_order", { ascending: false }).limit(1);
    const sort = ((max as { sort_order: number }[] | null)?.[0]?.sort_order ?? -1) + 1;
    const { data, error } = await sb.from("props").insert({
      production_id: pid, name: p.name.trim(), scene: p.scene || null, character: p.character || null,
      status: "Needed", quantity: 1, notes: p.notes || `Added in rehearsal ${date}`, sort_order: sort,
    }).select("id").single();
    if (error) throw error;
    let undoNote: (() => Promise<void>) | null = null;
    if (p.logToReport !== false) {
      try {
        undoNote = await withReport(pid, date, (rid) => appendNote(pid, rid, "props", `New prop needed: ${p.name.trim()}${p.scene ? ` (${p.scene})` : ""}${p.character ? `, handled by ${p.character}` : ""}`));
      } catch { /* report is optional */ }
    }
    const id = (data as { id: string }).id;
    notify.created("Prop", p.name, async () => { await sb.from("props").delete().eq("id", id); await undoNote?.(); notify.info("Prop removed"); });
    return true;
  } catch (e) { notify.error((e as Error).message); return false; }
}

export async function addLineNote(pid: string, n: { date: string; character: string; page?: string; issue?: string; note?: string; line?: string }) {
  const sb = supabaseBrowser();
  try {
    const { data, error } = await sb.from("line_notes").insert({
      production_id: pid, date: n.date, character: n.character, page: n.page || null, issue: n.issue || null,
      note: n.note || null, line: n.line || null, sent: false,
    }).select("id").single();
    if (error) throw error;
    const id = (data as { id: string }).id;
    notify.created("Line note", `${n.character}${n.page ? ` · pg. ${n.page}` : ""}`, async () => { await sb.from("line_notes").delete().eq("id", id); notify.info("Line note removed"); });
    return true;
  } catch (e) { notify.error((e as Error).message); return false; }
}

export async function addTask(pid: string, t: { title: string; assignee_id: string | null; due_date?: string | null; userId: string }) {
  const sb = supabaseBrowser();
  try {
    const { data, error } = await sb.from("tasks").insert({
      production_id: pid, title: t.title.trim(), assignee_id: t.assignee_id, due_date: t.due_date || null,
      created_by: t.userId, department: "Stage Management",
    }).select("id").single();
    if (error) throw error;
    const id = (data as { id: string }).id;
    notify.created("Task", t.title, async () => { await sb.from("tasks").delete().eq("id", id); notify.info("Task removed"); });
    return true;
  } catch (e) { notify.error((e as Error).message); return false; }
}
