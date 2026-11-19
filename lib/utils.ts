export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function todayISO() {
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function fmtDate(iso?: string | null, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  if (!iso) return "";
  return parseISODate(iso.slice(0, 10)).toLocaleDateString("en-US", opts);
}

export function fmtLongDate(iso?: string | null) {
  return fmtDate(iso, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** "18:30:00" -> "6:30 PM" */
export function fmtTime(t?: string | null) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr ?? "00"} ${ampm}`;
}

export function fmtRange(a?: string | null, b?: string | null) {
  if (!a && !b) return "";
  if (a && b) return `${fmtTime(a)} – ${fmtTime(b)}`;
  return fmtTime(a || b);
}

/** minutes since midnight */
export function toMin(t?: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function overlaps(a1: string | null, a2: string | null, b1: string | null, b2: string | null) {
  const s1 = toMin(a1) ?? 0, e1 = toMin(a2) ?? 24 * 60;
  const s2 = toMin(b1) ?? 0, e2 = toMin(b2) ?? 24 * 60;
  return s1 < e2 && s2 < e1;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms = 500) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function monthMatrix(year: number, month: number) {
  // 6 weeks x 7 days, Sunday-first, ISO strings
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: string[] = [];
    for (let d = 0; d < 7; d++) {
      const x = new Date(start);
      x.setDate(start.getDate() + w * 7 + d);
      row.push(toISODate(x));
    }
    weeks.push(row);
  }
  return weeks;
}

export function dateRange(from: string, to: string) {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 800) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
