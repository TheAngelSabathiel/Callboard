/**
 * Importers for existing SM paperwork (Excel workbooks, Word meeting reports,
 * pasted schedules). Pure functions: grid/text in → plan out. Applying a plan to
 * the database lives in lib/importApply.ts.
 */
import type { AvailabilityStatus } from "./types";

export type Grid = string[][];
export type SheetKind = "directory" | "calendar" | "availability" | "breakdown" | "skip";

const norm = (s: string) => s.toLowerCase().replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
const clean = (s: string | undefined | null) => (s ?? "").replace(/\r/g, "").trim();
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON3 = MONTHS.map((m) => m.slice(0, 3));

// ------------------------------------------------------------------ cell → text
type CellLike = { value?: unknown; text?: string; isMerged?: boolean; address?: string; master?: { address?: string } } | undefined;
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function cellText(cell: CellLike): string {
  const v = cell?.value as unknown;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isoOf(v);
  if (typeof v === "object") {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; hyperlink?: string; error?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if ("result" in o) return o.result instanceof Date ? isoOf(o.result) : o.result === undefined || o.result === null ? "" : String(o.result);
    if (o.text) return String(o.text);
    if (o.error) return "";
    return "";
  }
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v);
}

/** exceljs worksheet → 2D text grid (1-based columns become 0-based). */
export function worksheetToGrid(ws: { rowCount: number; columnCount: number; getRow: (r: number) => { getCell: (c: number) => CellLike } }): Grid {
  const out: Grid = [];
  const cols = Math.min(ws.columnCount, 400);
  for (let r = 1; r <= Math.min(ws.rowCount, 3000); r++) {
    const row = ws.getRow(r);
    const line: string[] = [];
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      // merged ranges: keep the value only in the top-left (master) cell
      const slave = cell?.isMerged && cell.master && cell.master.address !== cell.address;
      line.push(slave ? "" : cellText(cell));
    }
    out.push(line);
  }
  // trim trailing empty rows
  while (out.length && out[out.length - 1].every((x) => !x.trim())) out.pop();
  return out;
}

// ------------------------------------------------------------------ detection
function findHeader(grid: Grid, must: string[][], maxRow = 40) {
  for (let r = 0; r < Math.min(grid.length, maxRow); r++) {
    const cells = grid[r].map(norm);
    if (must.every((alts) => cells.some((c) => alts.some((a) => c === a || c.startsWith(a))))) return r;
  }
  return -1;
}

export function detectSheet(name: string, grid: Grid): SheetKind {
  const n = norm(name);
  if (findHeader(grid, [["date"], ["time"], ["rehearsal agenda", "agenda"]]) >= 0) return "calendar";
  if (findHeader(grid, [["page"], ["character", "characters"]]) >= 0 || findHeader(grid, [["page"], ["setting"]]) >= 0) return "breakdown";
  const avHeader = findHeader(grid, [["role", "position"], ["name"]]);
  if (avHeader >= 0) {
    const weekdayRow = grid.slice(avHeader, avHeader + 4).find((row) => row.filter((c) => /^(m|t|w|th|f|sa|su)$/i.test(c.trim())).length > 6);
    if (weekdayRow) return "availability";
    return "directory";
  }
  if (n.includes("directory")) return "directory";
  return "skip";
}

// ------------------------------------------------------------------ directory
export type DirPerson = { name: string; position: string; department: string; phone: string; email: string; isCast: boolean };
export type DirCast = { character: string; actor: string; alternate: string };
export type DirectoryPlan = { people: DirPerson[]; cast: DirCast[] };

export function parseDirectory(grid: Grid): DirectoryPlan {
  const h = findHeader(grid, [["role", "position"], ["name"]]);
  const people: DirPerson[] = [];
  const cast: DirCast[] = [];
  if (h < 0) return { people, cast };
  const head = grid[h].map(norm);
  const col = (...keys: string[]) => head.findIndex((c) => keys.some((k) => c.startsWith(k)));
  const cRole = col("role", "position"), cName = col("name"), cAlt = col("alternate"), cPhone = col("contact", "phone", "mobile", "number"), cEmail = col("email", "e-mail");
  let section = "Production";
  let castSection = false;
  for (let r = h + 1; r < grid.length; r++) {
    const row = grid[r];
    const filled = row.map((x, i) => [i, clean(x)] as const).filter(([, x]) => x);
    if (!filled.length) continue;
    const role = clean(row[cRole]), name = clean(row[cName]);
    // section header: one filled cell (not a numbered row)
    const distinct = new Set(filled.map(([, x]) => x));
    if (distinct.size === 1 && (filled.length === 1 ? !name : true) && !/^\d+$/.test(filled[0][1])) {
      section = filled[0][1];
      castSection = /actor|cast/i.test(section);
      continue;
    }
    if (!name && !role) continue;
    const alt = cAlt >= 0 ? clean(row[cAlt]) : "";
    const phone = cPhone >= 0 ? clean(row[cPhone]) : "";
    const email = cEmail >= 0 ? clean(row[cEmail]) : "";
    const numbered = /^\d+$/.test(clean(row[0])) && cRole !== 0;
    if (castSection || numbered) {
      const actor = name || "";
      cast.push({ character: role || name, actor, alternate: alt });
      if (actor) people.push({ name: actor, position: "Actor", department: "Cast", phone, email, isCast: true });
      if (alt) people.push({ name: alt, position: `Alternate`, department: "Cast", phone: "", email: "", isCast: true });
    } else if (name) {
      people.push({ name, position: role, department: deptFor(role, section), phone, email, isCast: false });
    }
  }
  return { people: dedupePeople(people), cast };
}

function dedupePeople(list: DirPerson[]) {
  const map = new Map<string, DirPerson>();
  for (const p of list) {
    const k = norm(p.name);
    const cur = map.get(k);
    if (!cur) map.set(k, { ...p });
    else {
      // staff position wins over "Actor"
      if (cur.isCast && !p.isCast) { cur.position = p.position; cur.department = p.department; cur.isCast = false; }
      cur.phone ||= p.phone; cur.email ||= p.email;
    }
  }
  return Array.from(map.values());
}

export function deptFor(position: string, section = "") {
  const p = norm(position + " " + section);
  if (/stage manag|\bsm\b|\basm\b/.test(p)) return "Stage Management";
  if (/director|direction/.test(p)) return "Direction";
  if (/producer|production manager|production staff/.test(p)) return "Production";
  if (/light/.test(p)) return "Lights";
  if (/sound|audio/.test(p)) return "Sound";
  if (/music/.test(p)) return "Music";
  if (/costume|wardrobe/.test(p)) return "Costume";
  if (/make ?up|hair/.test(p)) return "Hair & Makeup";
  if (/set|scenograph/.test(p)) return "Set";
  if (/prop/.test(p)) return "Props";
  if (/video|projection|led/.test(p)) return "Video / Projection";
  if (/choreo|movement|dance/.test(p)) return "Choreography / Movement";
  if (/venue/.test(p)) return "Venue";
  if (/market|publicity|social/.test(p)) return "Marketing";
  if (/actor|cast/.test(p)) return "Cast";
  return "Production";
}

export function roleFor(position: string, isCast: boolean): "head_sm" | "sm" | "asm" | "director" | "production_manager" | "designer" | "crew" | "actor" {
  const p = norm(position);
  if (isCast) return "actor";
  if (/head stage manager|production stage manager|\bpsm\b/.test(p)) return "head_sm";
  if (/assistant stage manager|asst\.? stage manager|\basm\b/.test(p)) return "asm";
  if (/stage manager/.test(p)) return "sm";
  if (/production manager/.test(p)) return "production_manager";
  if (/director/.test(p)) return "director";
  if (/designer/.test(p)) return "designer";
  return "crew";
}

// ------------------------------------------------------------------ time parsing
/** "6:00 PM-7:30PM", "1:30 - 2:00 PM", "8:30 PM - 10 PM" → ["18:00","19:30"] */
export function parseTimeRange(s: string): [string | null, string | null] {
  const m = s.replace(/\s+/g, " ").match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!m) {
    const one = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    return one ? [to24(+one[1], +(one[2] ?? 0), one[3]), null] : [null, null];
  }
  const [, h1, m1, ap1, h2, m2, ap2] = m;
  const ap2n = ap2 ?? ap1 ?? (Number(h2) < 8 || Number(h2) === 12 ? "pm" : "am");
  let ap1n = ap1 ?? ap2n;
  // "11:30 - 1:00 PM" → start is AM
  if (!ap1 && ap2 && /p/i.test(ap2) && Number(h1) > Number(h2) && Number(h1) !== 12) ap1n = "am";
  return [to24(+h1, +(m1 ?? 0), ap1n), to24(+h2, +(m2 ?? 0), ap2n)];
}

function to24(h: number, m: number, ap?: string) {
  let hh = h % 12;
  if (ap && /p/i.test(ap)) hh += 12;
  if (!ap && h <= 7) hh += 12; // bare "6:00" in rehearsal context → evening
  if (!ap && h === 12) hh = 12;
  return `${pad(hh)}:${pad(m)}`;
}

// ------------------------------------------------------------------ tabular calendar
export type PlanBlock = { start: string | null; end: string | null; agenda: string; called: string };
export type PlanEvent = { date: string; venue: string; notes: string; title: string; blocks: PlanBlock[] };

export function parseTabularCalendar(grid: Grid): PlanEvent[] {
  const events: PlanEvent[] = [];
  let cur: PlanEvent | null = null;
  let cols: Record<string, number> | null = null;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    const n = row.map(norm);
    if (n.includes("date") && n.some((c) => c.startsWith("time"))) {
      const f = (k: string) => n.findIndex((c) => c.startsWith(k));
      cols = { date: f("date"), venue: f("venue"), time: f("time"), agenda: f("rehearsal agenda") >= 0 ? f("rehearsal agenda") : f("agenda"), called: f("called"), notes: f("notes") };
      continue;
    }
    if (!cols) continue;
    const dateCell = clean(row[cols.date]);
    const iso = dateCell.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? parseLooseDate(dateCell);
    const time = clean(row[cols.time]);
    const agenda = cols.agenda >= 0 ? clean(row[cols.agenda]) : "";
    if (iso) {
      cur = { date: iso, venue: cols.venue >= 0 ? clean(row[cols.venue]) : "", notes: cols.notes >= 0 ? clean(row[cols.notes]) : "", title: "Rehearsal", blocks: [] };
      events.push(cur);
    }
    if (!cur || (!time && !agenda)) continue;
    const [start, end] = parseTimeRange(time);
    cur.blocks.push({ start, end, agenda: agenda || time, called: cols.called >= 0 ? clean(row[cols.called]) : "" });
    if (!cur.notes && cols.notes >= 0) cur.notes = clean(row[cols.notes]);
  }
  events.forEach((e) => (e.title = titleFromBlocks(e.blocks)));
  return events;
}

function titleFromBlocks(blocks: PlanBlock[]) {
  const acts = Array.from(new Set(blocks.flatMap((b) => (b.agenda.toUpperCase().match(/ACT\s*\d+|ACT\s*[IVX]+/g) ?? []).map((a) => a.replace(/\s+/, " ")))));
  if (blocks.some((b) => /tech/i.test(b.agenda))) return `Tech${acts.length ? ` · ${acts.join(", ")}` : ""}`;
  if (blocks.some((b) => /full run|run[- ]?through/i.test(b.agenda))) return `Run${acts.length ? ` · ${acts.join(", ")}` : ""}`;
  return acts.length ? `Rehearsal · ${acts.join(", ")}` : "Rehearsal";
}

function parseLooseDate(s: string, year?: number): string | null {
  const m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/);
  if (!m) return null;
  const mi = MON3.indexOf(m[1].slice(0, 3).toLowerCase());
  if (mi < 0) return null;
  const y = m[3] ? Number(m[3]) : year ?? null;
  if (!y) return null;
  return `${y}-${pad(mi + 1)}-${pad(Number(m[2]))}`;
}

// ------------------------------------------------------------------ availability grid
export type AvailPlan = { people: { name: string; position: string; note: string }[]; entries: { name: string; date: string; status: AvailabilityStatus; note?: string }[] };

export function parseAvailability(grid: Grid, startYear: number): AvailPlan {
  const h = findHeader(grid, [["role", "position"], ["name"]]);
  const plan: AvailPlan = { people: [], entries: [] };
  if (h < 0) return plan;
  const head = grid[h].map(norm);
  const cRole = head.findIndex((c) => c.startsWith("role") || c.startsWith("position"));
  const cName = head.findIndex((c) => c === "name");
  const cNotes = head.findIndex((c) => c.startsWith("notes"));
  // day numbers: first row under header where many cells are 1..31
  let dayRow = -1;
  for (let r = h; r < Math.min(grid.length, h + 5); r++) {
    if (grid[r].filter((c) => /^\d{1,2}$/.test(c.trim()) && +c <= 31).length > 6) { dayRow = r; break; }
  }
  if (dayRow < 0) return plan;
  // month per column: start from the first month label, advance whenever day numbers restart
  const firstLabel = grid[h].map(norm).find((c) => MONTHS.some((m) => c.startsWith(m.slice(0, 3)))) ?? "";
  let month = Math.max(0, MONTHS.findIndex((m) => firstLabel.startsWith(m.slice(0, 3))));
  let year = startYear;
  let prevDay = 0;
  const colDate = new Map<number, string>();
  grid[dayRow].forEach((c, i) => {
    if (!/^\d{1,2}$/.test(c.trim()) || i === cRole || i === cName) return;
    const d = Number(c);
    if (prevDay && d < prevDay) { month++; if (month > 11) { month = 0; year++; } }
    prevDay = d;
    // template sheets often have 31 columns for every month: skip impossible dates
    if (d <= new Date(Date.UTC(year, month + 1, 0)).getUTCDate()) colDate.set(i, `${year}-${pad(month + 1)}-${pad(d)}`);
  });
  const map: Record<string, AvailabilityStatus> = { a: "A", available: "A", un: "UN", u: "UN", na: "UN", "n/a": "UN", unavailable: "UN", tbd: "TBD", "not sure": "TBD", "?": "TBD", part: "PART", partial: "PART" };
  for (let r = dayRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const name = clean(row[cName]);
    if (!name || name === "--") continue;
    const position = clean(row[cRole]);
    const extraNotes: string[] = [];
    colDate.forEach((date, ci) => {
      const v = clean(row[ci]);
      if (!v) return;
      const st = map[norm(v)];
      if (st) plan.entries.push({ name, date, status: st });
      else { plan.entries.push({ name, date, status: "TBD", note: v }); }
    });
    if (cNotes >= 0 && clean(row[cNotes])) extraNotes.push(clean(row[cNotes]));
    plan.people.push({ name, position, note: extraNotes.join(" ") });
  }
  return plan;
}

// ------------------------------------------------------------------ breakdown
export type PlanScene = Record<string, string>;
const BD_MAP: [RegExp, string][] = [
  [/^french scene|^unit$/, "french_scene"], [/^page|^pg/, "page"], [/^setting|^action/, "setting"],
  [/^character/, "characters"], [/^entrance|^ent/, "entrances"], [/^exit|^ext/, "exits"], [/^prop/, "props"],
  [/^set/, "set_notes"], [/^sound|^sfx|^music|^mx/, "sound"], [/^light|^lx/, "lights"], [/^video|^projection|^led/, "video"],
  [/^costume|^wardrobe/, "costume"], [/dance|movement|choreo/, "movement"], [/^remark|^notes?$/, "remarks"],
];

export function parseBreakdown(grid: Grid): PlanScene[] {
  let h = findHeader(grid, [["page"], ["character", "characters"]]);
  if (h < 0) h = findHeader(grid, [["page"], ["setting"]]);
  if (h < 0) return [];
  const head = grid[h].map(norm);
  const colKey = new Map<number, string>();
  head.forEach((c, i) => { const hit = BD_MAP.find(([re]) => re.test(c)); if (hit && !Array.from(colKey.values()).includes(hit[1])) colKey.set(i, hit[1]); });
  const firstMapped = Math.min(...Array.from(colKey.keys()));
  const out: PlanScene[] = [];
  let act = "";
  for (let r = h + 1; r < grid.length; r++) {
    const row = grid[r];
    const filled = row.map(clean).filter(Boolean);
    if (!filled.length) continue;
    if (filled.length === 1 && /^(act|akto|yugto)\b/i.test(filled[0])) { act = filled[0].toUpperCase(); continue; }
    const rec: PlanScene = { act };
    // unnamed columns left of the table hold the unit / french scene number
    const unit = row.slice(0, firstMapped).map(clean).filter(Boolean).join(" ");
    if (unit) rec.unit = unit.replace(/\.0$/, "");
    colKey.forEach((k, i) => { const v = clean(row[i]); if (v) rec[k] = v; });
    if (Object.keys(rec).length > 1) out.push(rec);
  }
  return out;
}

// ------------------------------------------------------------------ name matching
export type CharRef = { id: string; name: string; actor_id: string | null };

/** Match "Tony", "Dona Irene", "Don Pepe" etc. to characters. Returns ids + unmatched tokens. */
export function matchCalled(text: string, chars: CharRef[]) {
  const tokens = text.split(/[,;\n]+|\band\b|&/i).map((t) => t.trim()).filter(Boolean);
  const all = /\ball\b.*\b(actors?|cast|called)\b|^all$/i.test(text.trim());
  const ids = new Set<string>();
  const unmatched: string[] = [];
  const alias = (c: CharRef) => {
    const parts = c.name.split("/").map((x) => norm(x)).filter(Boolean);
    const out = new Set<string>(parts);
    parts.forEach((p) => { out.add(p.replace(/^(don|dona|doña|donya)\s+/, "")); out.add(p.split(" ")[0]); });
    return Array.from(out).map((a) => a.replace(/ñ/g, "n")).filter((a) => a.length > 1 && !["don", "dona", "the"].includes(a));
  };
  const table = chars.map((c) => ({ c, al: alias(c) }));
  for (const t of tokens) {
    const n = norm(t).replace(/ñ/g, "n").replace(/^(the)\s+/, "");
    if (!n || /\ball\b/.test(n)) continue;
    const exact = table.filter(({ al }) => al.includes(n));
    const hit = exact.length ? exact : table.filter(({ al }) => al.some((a) => n.startsWith(a + " ") || a.startsWith(n + " ")));
    if (hit.length === 1 || (hit.length > 1 && exact.length >= 1)) { if (hit[0].c.actor_id) ids.add(hit[0].c.actor_id); else unmatched.push(t); }
    else unmatched.push(t);
  }
  return { ids: Array.from(ids), all, unmatched };
}

// ------------------------------------------------------------------ meeting report (.docx text)
export type MeetingPlan = { number: string; start: string; end: string; agenda: string; present: string[]; notes: string; schedules: string; next: string; preparedBy: string };

const LABELS: [keyof MeetingPlan, RegExp][] = [
  ["number", /meeting report\s*#/i], ["start", /start time\s*:/i], ["end", /end time\s*:/i], ["agenda", /^agenda\s*:/im],
  ["present", /present\s*:/i], ["notes", /general meeting notes\s*:|meeting notes\s*:|notes\s*:/i],
  ["schedules", /schedules given\/received\s*:/i], ["next", /next rehearsal date\s*:/i], ["preparedBy", /prepared by\s*:/i],
];

export function parseMeetingText(text: string): MeetingPlan {
  const t = text.replace(/\r/g, "");
  const found: { key: keyof MeetingPlan; at: number; end: number }[] = [];
  for (const [key, re] of LABELS) {
    const m = re.exec(t);
    if (m) found.push({ key, at: m.index, end: m.index + m[0].length });
  }
  found.sort((a, b) => a.at - b.at);
  const val = (k: keyof MeetingPlan) => {
    const i = found.findIndex((f) => f.key === k);
    if (i < 0) return "";
    const next = found[i + 1]?.at ?? t.length;
    return t.slice(found[i].end, next).replace(/\n{3,}/g, "\n\n").trim();
  };
  return {
    number: val("number").split("\n")[0].trim(),
    start: val("start"), end: val("end"), agenda: val("agenda"),
    present: val("present").split("\n").map((x) => x.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean),
    notes: val("notes"), schedules: val("schedules"), next: val("next"),
    preparedBy: val("preparedBy").split("\n")[0].trim(),
  };
}

// ------------------------------------------------------------------ schedule text ("DEC 2- ACT 2 … - 6:00 PM-7:30PM: UNIT 30")
export function parseScheduleText(text: string, year: number): PlanEvent[] {
  const events: PlanEvent[] = [];
  let cur: PlanEvent | null = null;
  let lastMonth = -1;
  let y = year;
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const dm = line.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[:\-–—]?\s*(.*)$/);
    const mi = dm ? MON3.indexOf(dm[1].slice(0, 3).toLowerCase()) : -1;
    if (dm && mi >= 0) {
      if (lastMonth >= 0 && mi < lastMonth) y++;
      lastMonth = mi;
      cur = { date: `${y}-${pad(mi + 1)}-${pad(Number(dm[2]))}`, venue: "", notes: "", title: dm[3]?.trim() || "Rehearsal", blocks: [] };
      events.push(cur);
      continue;
    }
    const dayOnly = line.match(/^(\d{1,2})\s*[:\-–—]\s*(.+)$/);
    if (dayOnly && lastMonth >= 0 && !/\d\s*(am|pm)/i.test(line)) {
      cur = { date: `${y}-${pad(lastMonth + 1)}-${pad(Number(dayOnly[1]))}`, venue: "", notes: "", title: dayOnly[2].trim(), blocks: [] };
      events.push(cur);
      continue;
    }
    if (!cur) continue;
    const bm = line.match(/^[-•*]?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–—]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*:?\s*(.*)$/i);
    if (bm) {
      const [start, end] = parseTimeRange(bm[1]);
      cur.blocks.push({ start, end, agenda: bm[2].trim() || "TBA", called: "" });
    } else if (!cur.blocks.length && line.includes(",") && !/\d/.test(line)) {
      // called list for the whole day
      (cur as PlanEvent & { called?: string }).called = line;
    } else {
      cur.notes = cur.notes ? `${cur.notes}\n${line}` : line;
    }
  }
  events.forEach((e) => {
    const called = (e as PlanEvent & { called?: string }).called;
    if (called) e.blocks.forEach((b) => { if (!/dinner|break|lunch/i.test(b.agenda)) b.called = called; });
    if (!e.blocks.length) e.blocks.push({ start: null, end: null, agenda: e.title, called: called ?? "" });
  });
  return events;
}
