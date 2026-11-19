import type { Availability, AvailabilityStatus, Character, EventBlock, EventType, Member } from "./types";
import { toMin } from "./utils";

export const EVENT_TYPES: { value: EventType; label: string; color: string }[] = [
  { value: "rehearsal", label: "Rehearsal", color: "#2563eb" },
  { value: "tech", label: "Tech", color: "#7c3aed" },
  { value: "dress", label: "Dress", color: "#db2777" },
  { value: "show", label: "Show", color: "#c2410c" },
  { value: "meeting", label: "Meeting", color: "#0f766e" },
  { value: "fitting", label: "Fitting", color: "#a16207" },
  { value: "shoot", label: "Shoot", color: "#4d7c0f" },
  { value: "load_in", label: "Load-in", color: "#475569" },
  { value: "strike", label: "Strike", color: "#475569" },
  { value: "other", label: "Other", color: "#6b7080" },
];
export const typeMeta = (t: EventType) => EVENT_TYPES.find((x) => x.value === t) ?? EVENT_TYPES[EVENT_TYPES.length - 1];

export const AVAIL: { value: AvailabilityStatus; label: string; cls: string }[] = [
  { value: "A", label: "Available", cls: "bg-green-100 text-green-800" },
  { value: "UN", label: "Unavailable", cls: "bg-red-100 text-red-800" },
  { value: "TBD", label: "Not sure", cls: "bg-amber-100 text-amber-800" },
  { value: "PART", label: "Partial", cls: "bg-sky-100 text-sky-800" },
];
export const availMeta = (s?: AvailabilityStatus | null) => AVAIL.find((x) => x.value === s);
export const AVAIL_CYCLE: (AvailabilityStatus | null)[] = ["A", "UN", "TBD", "PART", null];

/** Members called for a block (expanding "all called" to all cast). */
export function calledMembers(block: Pick<EventBlock, "called_ids" | "called_all">, members: Member[]) {
  if (block.called_all) return members.filter((m) => m.role === "actor" || m.department === "Cast");
  return members.filter((m) => block.called_ids?.includes(m.id));
}

export type Conflict = { member: Member; status: AvailabilityStatus | "none"; note?: string | null };

/**
 * People called in a block who are not clearly available.
 * - UN: conflict
 * - TBD / no response: warning
 * - PART: conflict only if their window does not cover the block
 */
export function blockConflicts(
  block: Pick<EventBlock, "called_ids" | "called_all" | "start_time" | "end_time">,
  date: string,
  members: Member[],
  avail: Availability[]
): Conflict[] {
  const out: Conflict[] = [];
  for (const m of calledMembers(block, members)) {
    const a = avail.find((x) => x.member_id === m.id && x.date === date);
    if (!a) { out.push({ member: m, status: "none" }); continue; }
    if (a.status === "A") continue;
    if (a.status === "PART") {
      const bs = toMin(block.start_time) ?? 0, be = toMin(block.end_time) ?? 24 * 60;
      const fs = toMin(a.from_time) ?? 0, fe = toMin(a.to_time) ?? 24 * 60;
      if (bs >= fs && be <= fe) continue;
    }
    out.push({ member: m, status: a.status, note: a.note });
  }
  return out;
}

/** "Joel Lamangan (Candido)" style label */
export function castLabel(m: Member, chars: Character[]) {
  const roles = chars.filter((c) => c.actor_id === m.id || c.alternate_id === m.id).map((c) => c.name + (c.alternate_id === m.id ? " alt" : ""));
  return roles.length ? `${m.display_name} (${roles.join(", ")})` : m.display_name;
}

/** Character names for called members, falling back to person names. Matches SM paperwork style. */
export function calledText(block: Pick<EventBlock, "called_ids" | "called_all">, members: Member[], chars: Character[]) {
  if (block.called_all) return "All actors are called";
  const parts: string[] = [];
  for (const id of block.called_ids ?? []) {
    const c = chars.filter((x) => x.actor_id === id || x.alternate_id === id);
    if (c.length) parts.push(...c.map((x) => x.name));
    else {
      const m = members.find((x) => x.id === id);
      if (m) parts.push(m.display_name);
    }
  }
  return Array.from(new Set(parts)).join(", ");
}
