import type { AttendanceStatus, ReportType } from "./types";
import { toMin } from "./utils";

export const REPORT_TYPES: { value: ReportType; label: string; short: string }[] = [
  { value: "rehearsal", label: "Rehearsal Report", short: "Rehearsal" },
  { value: "tech", label: "Tech Report", short: "Tech" },
  { value: "performance", label: "Performance Report", short: "Performance" },
  { value: "meeting", label: "Meeting Report", short: "Meeting" },
];
export const reportLabel = (t: ReportType) => REPORT_TYPES.find((x) => x.value === t)?.label ?? "Report";

export const ATTENDANCE: { value: AttendanceStatus; label: string; cls: string }[] = [
  { value: "present", label: "Present", cls: "bg-green-100 text-green-800" },
  { value: "late", label: "Late", cls: "bg-amber-100 text-amber-800" },
  { value: "absent", label: "Absent", cls: "bg-red-100 text-red-800" },
  { value: "excused", label: "Excused", cls: "bg-sky-100 text-sky-800" },
  { value: "not_called", label: "Not called", cls: "bg-paper text-ink-mute" },
];

/** Timing fields shown per report type. Values are "HH:MM" strings (or numbers for counts). */
export const TIMING_FIELDS: Record<ReportType, { key: string; label: string; kind?: "time" | "text" }[]> = {
  rehearsal: [
    { key: "call", label: "Call" },
    { key: "start", label: "Rehearsal start" },
    { key: "break_start", label: "Break start" },
    { key: "break_end", label: "Break end" },
    { key: "end", label: "Rehearsal end" },
  ],
  tech: [
    { key: "call", label: "Crew call" },
    { key: "start", label: "Tech start" },
    { key: "break_start", label: "Break start" },
    { key: "break_end", label: "Break end" },
    { key: "end", label: "Tech end" },
    { key: "stopped_at", label: "Stopped at (page/cue)", kind: "text" },
  ],
  performance: [
    { key: "house_open", label: "House open" },
    { key: "act1_up", label: "Act 1 up" },
    { key: "act1_down", label: "Act 1 down" },
    { key: "act2_up", label: "Act 2 up" },
    { key: "act2_down", label: "Act 2 down" },
    { key: "act3_up", label: "Act 3 up" },
    { key: "act3_down", label: "Act 3 down" },
    { key: "curtain", label: "Curtain call end" },
    { key: "house_count", label: "House count", kind: "text" },
    { key: "hold_reason", label: "Hold reason", kind: "text" },
  ],
  meeting: [],
};

export function diffMin(a?: string, b?: string) {
  const x = toMin(a), y = toMin(b);
  if (x === null || y === null) return null;
  return y >= x ? y - x : y + 1440 - x;
}

export const fmtDuration = (m: number | null) => (m === null ? "" : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);

/** Derived run times for performance reports */
export function runTimes(t: Record<string, string>) {
  const out: { label: string; value: string }[] = [];
  const acts = [1, 2, 3].map((n) => ({ n, d: diffMin(t[`act${n}_up`], t[`act${n}_down`]) })).filter((a) => a.d !== null);
  acts.forEach((a) => out.push({ label: `Act ${a.n}`, value: fmtDuration(a.d) }));
  const int1 = diffMin(t.act1_down, t.act2_up);
  if (int1 !== null) out.push({ label: "Intermission", value: fmtDuration(int1) });
  const total = diffMin(t.act1_up, t.curtain || t.act3_down || t.act2_down || t.act1_down);
  if (total !== null) out.push({ label: "Total running", value: fmtDuration(total) });
  const hold = diffMin(t.house_open, t.act1_up);
  if (hold !== null) out.push({ label: "House open → Go", value: fmtDuration(hold) });
  return out;
}
