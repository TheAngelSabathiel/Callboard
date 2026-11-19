"use client";
/** Writes import plans (lib/importers.ts) into the current production. */
import { supabaseBrowser } from "./supabase/client";
import { fetchAll } from "./fetchAll";
import type { Character, Member } from "./types";
import {
  type AvailPlan, type DirectoryPlan, type MeetingPlan, type PlanEvent, type PlanScene,
  deptFor, matchCalled, parseTimeRange, roleFor,
} from "./importers";

const norm = (s: string) => s.toLowerCase().replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
type Log = (msg: string) => void;

async function load(pid: string) {
  const [members, characters] = await Promise.all([
    fetchAll<Member>("members", "production_id", pid, "sort_order"),
    fetchAll<Character>("characters", "production_id", pid, "sort_order"),
  ]);
  return { members, characters };
}

function chunk<T>(list: T[], n = 500) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/** Find or create a member by name. */
async function ensureMember(pid: string, members: Member[], name: string, extra: Partial<Member>) {
  const hit = members.find((m) => norm(m.display_name) === norm(name));
  if (hit) return hit;
  const { data, error } = await supabaseBrowser().from("members").insert({
    production_id: pid, display_name: name.trim(), role: "viewer", sort_order: members.length, ...extra,
  }).select("*").single();
  if (error) throw error;
  members.push(data as Member);
  return data as Member;
}

// ------------------------------------------------------------------ directory
export async function applyDirectory(pid: string, plan: DirectoryPlan, log: Log) {
  const sb = supabaseBrowser();
  const { members, characters } = await load(pid);
  let added = 0, updated = 0;
  for (const p of plan.people) {
    const hit = members.find((m) => norm(m.display_name) === norm(p.name));
    if (hit) {
      const patch: Partial<Member> = {};
      if (!hit.phone && p.phone) patch.phone = p.phone;
      if (!hit.email && p.email) patch.email = p.email;
      if (!hit.position && p.position) patch.position = p.position;
      if (Object.keys(patch).length) { await sb.from("members").update(patch).eq("id", hit.id); updated++; }
      continue;
    }
    await ensureMember(pid, members, p.name, {
      position: p.position || null, department: p.department, role: roleFor(p.position, p.isCast),
      phone: p.phone || null, email: p.email || null,
    });
    added++;
  }
  let chars = 0;
  for (const [i, c] of plan.cast.entries()) {
    const name = c.character.trim();
    if (!name) continue;
    const actor = c.actor ? members.find((m) => norm(m.display_name) === norm(c.actor)) : undefined;
    const alt = c.alternate ? members.find((m) => norm(m.display_name) === norm(c.alternate)) : undefined;
    const hit = characters.find((x) => norm(x.name) === norm(name));
    if (hit) {
      const patch: Partial<Character> = {};
      if (!hit.actor_id && actor) patch.actor_id = actor.id;
      if (!hit.alternate_id && alt) patch.alternate_id = alt.id;
      if (Object.keys(patch).length) await sb.from("characters").update(patch).eq("id", hit.id);
      continue;
    }
    const { error } = await sb.from("characters").insert({ production_id: pid, name, actor_id: actor?.id ?? null, alternate_id: alt?.id ?? null, sort_order: characters.length + i });
    if (error) throw error;
    chars++;
  }
  log(`Directory: ${added} people added, ${updated} updated, ${chars} characters added.`);
}

// ------------------------------------------------------------------ calendar
export async function applyCalendar(pid: string, events: PlanEvent[], opts: { skipExistingDates: boolean; venueDefault?: string }, log: Log) {
  const sb = supabaseBrowser();
  const { characters } = await load(pid);
  const existing = new Set((await fetchAll<{ id: string; date: string }>("events", "production_id", pid, "date", "id,date")).map((e) => e.date));
  const { data: u } = await sb.auth.getUser();
  let created = 0, skipped = 0, unmatchedTotal = new Set<string>();
  for (const e of events) {
    if (opts.skipExistingDates && existing.has(e.date)) { skipped++; continue; }
    const starts = e.blocks.map((b) => b.start).filter(Boolean) as string[];
    const ends = e.blocks.map((b) => b.end).filter(Boolean) as string[];
    const type = /tech/i.test(e.title) ? "tech" : /dress/i.test(e.title) ? "dress" : /show|performance/i.test(e.title) ? "show" : "rehearsal";
    const { data, error } = await sb.from("events").insert({
      production_id: pid, date: e.date, title: e.title || "Rehearsal", type,
      venue: e.venue || opts.venueDefault || null, notes: e.notes || null,
      start_time: starts.sort()[0] ?? null, end_time: ends.sort().reverse()[0] ?? null,
      call_time: e.blocks.find((b) => /call/i.test(b.agenda))?.start ?? null, created_by: u.user?.id,
    }).select("id").single();
    if (error) throw error;
    const eid = (data as { id: string }).id;
    const rows = e.blocks.map((b, i) => {
      const m = matchCalled(b.called, characters);
      m.unmatched.forEach((x) => unmatchedTotal.add(x));
      return {
        event_id: eid, production_id: pid, start_time: b.start, end_time: b.end, agenda: b.agenda,
        called_ids: m.ids, called_all: m.all, sort_order: i,
        notes: m.unmatched.length ? `Also called: ${m.unmatched.join(", ")}` : null,
      };
    });
    if (rows.length) { const { error: e2 } = await sb.from("event_blocks").insert(rows); if (e2) throw e2; }
    created++;
  }
  log(`Calendar: ${created} days created${skipped ? `, ${skipped} skipped (date already scheduled)` : ""}.`);
  if (unmatchedTotal.size) log(`  Not matched to a character (kept in block notes): ${Array.from(unmatchedTotal).slice(0, 25).join(", ")}${unmatchedTotal.size > 25 ? "…" : ""}`);
}

// ------------------------------------------------------------------ availability
export async function applyAvailability(pid: string, plan: AvailPlan, log: Log) {
  const sb = supabaseBrowser();
  const { members, characters } = await load(pid);
  const ids = new Map<string, string>();
  let newPeople = 0;
  for (const p of plan.people) {
    const asChar = characters.find((c) => norm(c.name) === norm(p.position));
    const before = members.length;
    const m = await ensureMember(pid, members, p.name, {
      position: asChar ? "Actor" : p.position || null,
      department: asChar ? "Cast" : deptFor(p.position),
      role: asChar ? "actor" : roleFor(p.position, false),
    });
    if (members.length > before) newPeople++;
    if (asChar && !asChar.actor_id) { await sb.from("characters").update({ actor_id: m.id }).eq("id", asChar.id); asChar.actor_id = m.id; }
    if (p.note && !m.notes) await sb.from("members").update({ notes: p.note }).eq("id", m.id);
    ids.set(norm(p.name), m.id);
  }
  const rows = plan.entries.map((e) => ({ production_id: pid, member_id: ids.get(norm(e.name))!, date: e.date, status: e.status, note: e.note ?? null })).filter((r) => r.member_id);
  for (const part of chunk(rows)) {
    const { error } = await sb.from("availability").upsert(part, { onConflict: "member_id,date" });
    if (error) throw error;
  }
  log(`Availability: ${rows.length} entries for ${plan.people.length} people${newPeople ? ` (${newPeople} new to the directory)` : ""}.`);
}

// ------------------------------------------------------------------ breakdown
export async function applyBreakdown(pid: string, scenes: PlanScene[], log: Log) {
  const sb = supabaseBrowser();
  const existing = await fetchAll<{ id: string; sort_order: number }>("scenes", "production_id", pid, "sort_order", "id,sort_order");
  const start = existing.length ? Math.max(...existing.map((s) => s.sort_order)) + 1 : 0;
  const rows = scenes.map((s, i) => ({ production_id: pid, sort_order: start + i, ...s }));
  for (const part of chunk(rows)) { const { error } = await sb.from("scenes").insert(part); if (error) throw error; }
  log(`Breakdown: ${rows.length} rows added.`);
}

// ------------------------------------------------------------------ meeting report
export async function applyMeeting(pid: string, plan: MeetingPlan, date: string, log: Log) {
  const sb = supabaseBrowser();
  const { members } = await load(pid);
  const { data: rid, error } = await sb.rpc("create_report", { p_production: pid, p_type: "meeting", p_date: date, p_event: null });
  if (error) throw error;
  const [start] = parseTimeRange(plan.start + " - " + plan.end);
  const [, end] = parseTimeRange(plan.start + " - " + plan.end);
  await sb.from("reports").update({
    agenda: plan.agenda || null, prepared_by: plan.preparedBy || null,
    start_time: plan.start ? start : null, end_time: plan.end ? end : null,
  }).eq("id", rid);
  const sections: Record<string, string> = { notes: plan.notes, schedules: plan.schedules, next: plan.next };
  const unmatched = plan.present.filter((n) => !members.some((m) => norm(m.display_name).startsWith(norm(n).split(" ").slice(0, 2).join(" "))));
  if (unmatched.length) sections.notes = `Also present: ${unmatched.join(", ")}\n\n${sections.notes}`;
  for (const [key, body] of Object.entries(sections)) {
    if (body) await sb.from("report_sections").update({ body }).eq("report_id", rid).eq("key", key);
  }
  const present = members.filter((m) => plan.present.some((n) => norm(m.display_name) === norm(n) || norm(n).startsWith(norm(m.display_name)) || norm(m.display_name).startsWith(norm(n))));
  if (present.length) {
    await sb.from("attendance").insert(present.map((m) => ({ report_id: rid, production_id: pid, member_id: m.id, status: "present" })));
  }
  log(`Meeting report for ${date}: created with ${present.length} attendees matched${unmatched.length ? `, ${unmatched.length} names kept in notes` : ""}.`);
  return rid as string;
}
