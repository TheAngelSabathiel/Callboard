"use client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import type {
  Attendance, Availability, Character, Cue, EventBlock, Member, ProdEvent, Production, Report,
  ReportSection, SceneRow, Script, ScriptLine, ScriptMark, Task, Prop, LineNote,
} from "@/lib/types";
import { ROLE_LABEL } from "@/lib/roles";
import { AVAIL, blockConflicts, calledText, typeMeta } from "@/lib/schedule";
import { ATTENDANCE, TIMING_FIELDS, reportLabel, runTimes } from "@/lib/reports";
import { addDays, dateRange, fmtDate, fmtLongDate, fmtRange, fmtTime, parseISODate, todayISO } from "@/lib/utils";
import { BREAKDOWN_COLUMNS, sceneChartData } from "@/components/breakdown";
import { type Block, type DocModel, productionHeader, slug } from "./model";

export type ExportKind =
  | "directory" | "tasks" | "calendar" | "callsheet" | "availability" | "report"
  | "promptbook" | "cues" | "breakdown" | "scenechart" | "props" | "linenotes" | "signin";

/** Download formats offered per document (Print/PDF is always available). */
export const KIND_FORMATS: Record<ExportKind, ("docx" | "xlsx")[]> = {
  directory: ["docx", "xlsx"], tasks: ["docx", "xlsx"], calendar: ["docx", "xlsx"], callsheet: ["docx"],
  availability: ["xlsx"], report: ["docx"], promptbook: ["docx", "xlsx"], cues: ["docx", "xlsx"],
  breakdown: ["docx", "xlsx"], scenechart: ["xlsx"], props: ["docx", "xlsx"], linenotes: ["docx", "xlsx"], signin: ["docx", "xlsx"],
};

export type Ctx = { production: Production; members: Member[]; characters: Character[] };
type Params = Record<string, string | undefined>;

const sb = () => supabaseBrowser();
const byId = <T extends { id: string }>(list: T[], id?: string | null) => list.find((x) => x.id === id);
const updated = () => `Updated as of: ${fmtDate(todayISO(), { month: "long", day: "numeric", year: "numeric" })}`;

export async function buildDoc(kind: ExportKind, ctx: Ctx, params: Params = {}): Promise<DocModel> {
  const p = ctx.production;
  const header = productionHeader(p);
  const base = slug(p.title);

  switch (kind) {
    // ------------------------------------------------------------ Directory
    case "directory": {
      const groups = new Map<string, Member[]>();
      ctx.members.forEach((m) => groups.set(m.department || "Other", [...(groups.get(m.department || "Other") ?? []), m]));
      const rows: string[][] = [];
      const groupRows: number[] = [];
      groups.forEach((list, dept) => {
        groupRows.push(rows.length); rows.push([dept.toUpperCase(), "", "", "", ""]);
        list.forEach((m) => rows.push([m.position ?? ROLE_LABEL[m.role], m.display_name, ctx.characters.filter((c) => c.alternate_id && c.actor_id === m.id).map((c) => byId(ctx.members, c.alternate_id)?.display_name).filter(Boolean).join(", "), m.phone ?? "", m.email ?? ""]));
      });
      const cast = ctx.characters.map((c, i) => [String(i + 1), c.name, byId(ctx.members, c.actor_id)?.display_name ?? "", byId(ctx.members, c.alternate_id)?.display_name ?? ""]);
      return {
        title: "DIRECTORY", header, subtitle: [p.script_version && `Script Version: ${p.script_version}`, updated()].filter(Boolean).join("   ·   "),
        orientation: "portrait", filename: `${base}-directory`, formats: ["docx", "xlsx"],
        blocks: [
          { type: "table", title: "Company", columns: [{ label: "Role / Position", width: 3 }, { label: "Name", width: 3 }, { label: "Alternates", width: 2 }, { label: "Contact Number", width: 2 }, { label: "Email", width: 3 }], rows, groupRows },
          ...(cast.length ? [{ type: "table", title: `Cast · Actors count: ${ctx.characters.length}`, columns: [{ label: "#", width: 0.5 }, { label: "Character", width: 3 }, { label: "Actor", width: 3 }, { label: "Alternate", width: 3 }], rows: cast } as Block] : []),
        ],
      };
    }

    // ------------------------------------------------------------ Tasks
    case "tasks": {
      const { data } = await sb().from("tasks").select("*").eq("production_id", p.id).order("due_date", { nullsFirst: false });
      const tasks = (data as Task[]) ?? [];
      return {
        title: "TASK LIST", header, subtitle: updated(), orientation: "landscape", filename: `${base}-tasks`, formats: ["docx", "xlsx"],
        blocks: [{
          type: "table",
          columns: [{ label: "Task", width: 4 }, { label: "Details", width: 4 }, { label: "Assigned to", width: 2 }, { label: "Dept", width: 2 }, { label: "Due", width: 1.5 }, { label: "Priority", width: 1 }, { label: "Status", width: 1.2 }],
          rows: tasks.map((t) => [t.title, t.description ?? "", byId(ctx.members, t.assignee_id)?.display_name ?? "Unassigned", t.department ?? "", t.due_date ? fmtDate(t.due_date) : "", t.priority, t.status.replace("_", " ")]),
          fills: tasks.map((t) => [null, null, null, null, null, null, t.status === "done" ? "dcfce7" : t.status === "blocked" ? "fee2e2" : null]),
        }],
      };
    }

    // ------------------------------------------------------------ Calendar (tabular)
    case "calendar": {
      const [events, blocks] = await Promise.all([
        fetchAll<ProdEvent>("events", "production_id", p.id, "date"),
        fetchAll<EventBlock>("event_blocks", "production_id", p.id, "sort_order"),
      ]);
      const from = params.from ?? "0000", to = params.to ?? "9999";
      const list = events.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date) || String(a.start_time).localeCompare(String(b.start_time)));
      const rows: string[][] = [];
      const fills: (string | null)[][] = [];
      list.forEach((e) => {
        const bl = blocks.filter((b) => b.event_id === e.id).sort((a, b) => a.sort_order - b.sort_order || String(a.start_time).localeCompare(String(b.start_time)));
        const notes = [e.notes, e.reminders && `Reminders:\n${e.reminders}`].filter(Boolean).join("\n\n");
        const dateCell = `${fmtDate(e.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}\n${typeMeta(e.type).label}: ${e.title}`;
        if (!bl.length) { rows.push([dateCell, e.venue ?? "", fmtRange(e.start_time, e.end_time), e.title, "", notes]); fills.push([hexTint(typeMeta(e.type).color), null, null, null, null, null]); return; }
        bl.forEach((b, i) => {
          rows.push([i === 0 ? dateCell : "", i === 0 ? e.venue ?? "" : "", fmtRange(b.start_time, b.end_time), [b.agenda, b.scenes].filter(Boolean).join("\n"), calledText(b, ctx.members, ctx.characters), i === 0 ? notes : ""]);
          fills.push([i === 0 ? hexTint(typeMeta(e.type).color) : null, null, null, null, null, null]);
        });
      });
      return {
        title: "REHEARSAL CALENDAR", header, subtitle: [p.script_version && `Script Version: ${p.script_version}`, updated()].filter(Boolean).join("   ·   "),
        orientation: "landscape", filename: `${base}-calendar`, formats: ["docx", "xlsx"],
        blocks: [{ type: "table", columns: [{ label: "Date", width: 2.2 }, { label: "Venue", width: 1.6 }, { label: "Time", width: 1.8 }, { label: "Rehearsal Agenda", width: 3 }, { label: "Called", width: 4 }, { label: "Notes", width: 4 }], rows, fills, fontSize: 9 }],
      };
    }

    // ------------------------------------------------------------ Call sheet (one day)
    case "callsheet": {
      const { data: ev } = await sb().from("events").select("*").eq("id", params.eventId!).single();
      const e = ev as ProdEvent;
      const [{ data: bl }, { data: av }] = await Promise.all([
        sb().from("event_blocks").select("*").eq("event_id", e.id).order("sort_order"),
        sb().from("availability").select("*").eq("production_id", p.id).eq("date", e.date),
      ]);
      const blocks = (bl as EventBlock[]) ?? [];
      const avail = (av as Availability[]) ?? [];
      const conflicts = blocks.flatMap((b) => blockConflicts(b, e.date, ctx.members, avail).filter((c) => c.status === "UN").map((c) => `${c.member.display_name} (${b.agenda})`));
      const sm = ctx.members.filter((m) => ["head_sm", "sm", "asm"].includes(m.role));
      return {
        title: `${typeMeta(e.type).label.toUpperCase()} CALL`, header, subtitle: fmtLongDate(e.date),
        orientation: "portrait", filename: `${base}-call-${e.date}`, formats: ["docx"],
        blocks: [
          { type: "kv", columns: 4, rows: [["Date", fmtLongDate(e.date)], ["Venue", e.venue ?? ""], ["Call time", fmtTime(e.call_time) || fmtTime(e.start_time)], ["Ends", fmtTime(e.end_time)], ["Focus", e.title], ["Stage Management", sm.map((m) => `${m.display_name}${m.phone ? ` ${m.phone}` : ""}`).join(", ")]] },
          { type: "table", title: "Schedule", columns: [{ label: "Time", width: 2 }, { label: "Agenda", width: 3 }, { label: "Units / Pages", width: 2 }, { label: "Called", width: 5 }], rows: blocks.map((b) => [fmtRange(b.start_time, b.end_time), b.agenda, b.scenes ?? "", calledText(b, ctx.members, ctx.characters)]) },
          ...(e.notes ? [{ type: "text", title: "Notes", body: e.notes } as Block] : []),
          ...(e.reminders ? [{ type: "text", title: "Reminders", body: e.reminders } as Block] : []),
          ...(conflicts.length ? [{ type: "text", title: "Known conflicts", body: conflicts.join("\n"), flag: true } as Block] : []),
        ],
      };
    }

    // ------------------------------------------------------------ Availability matrix
    case "availability": {
      const start = params.start ?? todayISO();
      const days = Number(params.days ?? 28);
      const dates = dateRange(start, addDays(start, days - 1));
      const avail = await fetchAll<Availability>("availability", "production_id", p.id, "date");
      const idx = new Map(avail.map((a) => [`${a.member_id}|${a.date}`, a]));
      const people = ctx.members.filter((m) => params.group === "all" ? true : m.role === "actor" || m.department === "Cast" || ["head_sm", "sm", "asm", "director", "production_manager"].includes(m.role));
      const color: Record<string, string> = { A: "dcfce7", UN: "fee2e2", TBD: "fef3c7", PART: "e0f2fe" };
      const rows = people.map((m) => [
        `${ctx.characters.filter((c) => c.actor_id === m.id).map((c) => c.name).join(", ") || m.position || ROLE_LABEL[m.role]}`,
        m.display_name,
        ...dates.map((d) => { const a = idx.get(`${m.id}|${d}`); return a ? a.status + (a.note ? "*" : "") : ""; }),
        avail.filter((a) => a.member_id === m.id && a.note && dates.includes(a.date)).map((a) => `${fmtDate(a.date, { month: "short", day: "numeric" })}: ${a.note}`).join("; "),
      ]);
      const fills = people.map((m) => [null, null, ...dates.map((d) => color[idx.get(`${m.id}|${d}`)?.status ?? ""] ?? null), null]);
      return {
        title: "PRODUCTION & ACTORS' SCHEDULE", header, subtitle: `LEGEND: ${AVAIL.map((a) => `${a.value} – ${a.label}`).join("   ")}   ·   ${updated()}`,
        orientation: "landscape", filename: `${base}-availability`, formats: ["xlsx"],
        blocks: [{
          type: "table", fontSize: 7,
          columns: [{ label: "Role / Position", width: 3 }, { label: "Name", width: 3 }, ...dates.map((d) => ({ label: `${["Su", "M", "T", "W", "Th", "F", "Sa"][parseISODate(d).getDay()]}\n${fmtDate(d, { month: "numeric", day: "numeric" })}`, width: 0.8 })), { label: "Notes", width: 5 }],
          rows, fills,
        }],
      };
    }

    // ------------------------------------------------------------ SM report
    case "report": {
      const rid = params.reportId!;
      const [{ data: r }, { data: s }, { data: a }] = await Promise.all([
        sb().from("reports").select("*").eq("id", rid).single(),
        sb().from("report_sections").select("*").eq("report_id", rid).order("sort_order"),
        sb().from("attendance").select("*").eq("report_id", rid),
      ]);
      const rep = r as Report;
      const sections = (s as ReportSection[]) ?? [];
      const att = ((a as Attendance[]) ?? []).sort((x, y) => (byId(ctx.members, x.member_id)?.sort_order ?? 0) - (byId(ctx.members, y.member_id)?.sort_order ?? 0));
      const nameOf = (id: string) => { const m = byId(ctx.members, id); if (!m) return ""; const ch = ctx.characters.filter((c) => c.actor_id === id || c.alternate_id === id).map((c) => c.name); return ch.length ? `${m.display_name} (${ch.join(", ")})` : m.display_name; };
      const blocks: Block[] = [
        { type: "kv", columns: 4, rows: [
          ["Date", fmtLongDate(rep.date)], ["Venue", rep.venue ?? ""],
          ["Start Time", fmtTime(rep.start_time)], ["End Time", fmtTime(rep.end_time)],
          ["Agenda", rep.agenda ?? rep.title ?? ""], ["Report status", rep.status === "final" ? "Final" : "Draft"],
        ] },
      ];
      const tf = TIMING_FIELDS[rep.type].filter((f) => rep.timings?.[f.key]);
      if (tf.length) {
        const rows: [string, string][] = tf.map((f) => [f.label, f.kind === "text" ? rep.timings[f.key] : fmtTime(rep.timings[f.key])]);
        if (rep.type === "performance") runTimes(rep.timings).forEach((x) => rows.push([x.label, x.value]));
        blocks.push({ type: "kv", columns: 4, rows });
      }
      if (rep.type === "meeting") {
        blocks.push({ type: "text", title: "Present", body: att.filter((x) => x.status === "present" || x.status === "late").map((x) => `• ${nameOf(x.member_id)}`).join("\n") || "—" });
      } else if (att.length) {
        const notIn = att.filter((x) => x.status !== "present");
        blocks.push({ type: "table", title: `Attendance · ${att.filter((x) => x.status === "present").length} present${notIn.length ? `, ${notIn.length} late/absent/excused` : ""}`,
          columns: [{ label: "Name", width: 4 }, { label: "Status", width: 1.5 }, { label: "Arrival", width: 1.2 }, { label: "Note", width: 4 }],
          rows: att.map((x) => [nameOf(x.member_id), ATTENDANCE.find((s) => s.value === x.status)?.label ?? x.status, fmtTime(x.arrival_time), x.note ?? ""]),
          fills: att.map((x) => [null, x.status === "late" ? "fef3c7" : x.status === "absent" ? "fee2e2" : null, null, null]),
        });
      }
      sections.forEach((sec) => blocks.push({ type: "text", title: sec.title + (sec.needs_attention ? "  ⚑ FOLLOW UP" : ""), body: sec.body?.trim() || "No notes. Thank you.", flag: sec.needs_attention }));
      blocks.push({ type: "signature", labels: [`Prepared by: ${rep.prepared_by ?? ""}`, "Noted by:"] });
      return {
        title: `${reportLabel(rep.type).toUpperCase()} #${rep.number ?? ""}`, header, subtitle: fmtLongDate(rep.date),
        orientation: "portrait", filename: `${base}-${rep.type}-report-${rep.number ?? ""}-${rep.date}`, formats: ["docx"],
        blocks,
      };
    }

    // ------------------------------------------------------------ Prompt book
    case "promptbook": {
      const { data: sc } = await sb().from("scripts").select("*").eq("id", params.scriptId!).single();
      const script = sc as Script;
      const [lines, marks, cues] = await Promise.all([
        fetchAll<ScriptLine>("script_lines", "script_id", script.id, "idx"),
        fetchAll<ScriptMark>("script_marks", "script_id", script.id, "created_at"),
        fetchAll<Cue>("cues", "production_id", p.id, "sort_key"),
      ]);
      const mBy = new Map<string, ScriptMark[]>(); marks.forEach((m) => mBy.set(m.line_id, [...(mBy.get(m.line_id) ?? []), m]));
      const goBy = new Map<string, Cue[]>(), sbBy = new Map<string, Cue[]>();
      cues.filter((c) => c.status !== "cut").forEach((c) => {
        if (c.line_id) goBy.set(c.line_id, [...(goBy.get(c.line_id) ?? []), c]);
        if (c.standby_line_id) sbBy.set(c.standby_line_id, [...(sbBy.get(c.standby_line_id) ?? []), c]);
      });
      const rows: string[][] = [];
      const fills: (string | null)[][] = [];
      const groupRows: number[] = [];
      let lastPage = -1;
      lines.filter((l) => l.kind !== "blank").forEach((l) => {
        if (l.page !== lastPage) { groupRows.push(rows.length); rows.push([`PAGE ${l.page}${l.act ? ` · ${l.act}` : ""}${l.scene ? ` · ${l.scene}` : ""}`, "", ""]); fills.push([null, null, null]); lastPage = l.page; }
        const lm = mBy.get(l.id) ?? [];
        const cueTxt = [...(sbBy.get(l.id) ?? []).map((c) => `stby ${c.dept} ${c.number}`), ...(goBy.get(l.id) ?? []).map((c) => `GO ${c.dept} ${c.number}${c.duration ? ` (${c.duration})` : ""}`)].join("\n");
        const margin = lm.filter((m) => m.type !== "highlight").map((m) => `${m.type === "blocking" ? "B" : m.type === "line_change" ? "Δ" : "N"}: ${m.text}`).join("\n");
        const textCell = l.kind === "dialogue" && l.speaker ? `${l.speaker}: ${l.text}` : l.text;
        rows.push([cueTxt, textCell, margin]);
        const hl = lm.find((m) => m.type === "highlight")?.color?.replace("#", "") ?? null;
        fills.push([cueTxt ? "fff1e8" : null, hl, null]);
      });
      return {
        title: "PROMPT BOOK", header, subtitle: `${script.title}${script.version ? ` · ${script.version}` : ""}   ·   ${updated()}`,
        orientation: "portrait", filename: `${base}-prompt-book`, formats: ["docx", "xlsx"],
        blocks: [{ type: "table", columns: [{ label: "Cues", width: 1.4 }, { label: "Script", width: 5 }, { label: "Blocking & Notes", width: 3 }], rows, fills, groupRows, fontSize: 9, monoCol: 1 }],
      };
    }

    // ------------------------------------------------------------ Cue sheet
    case "cues": {
      const all = await fetchAll<Cue>("cues", "production_id", p.id, "sort_key");
      const list = all.filter((c) => c.status !== "cut" && (!params.dept || c.dept === params.dept));
      return {
        title: params.dept ? `${params.dept} CUE SHEET` : "MASTER CUE SHEET", header, subtitle: updated(),
        orientation: "landscape", filename: `${base}-cues${params.dept ? `-${params.dept.toLowerCase()}` : ""}`, formats: ["docx", "xlsx"],
        blocks: [{
          type: "table",
          columns: [{ label: "Dept", width: 0.8 }, { label: "Cue", width: 0.7 }, { label: "Pg", width: 0.6 }, { label: "Act / Scene", width: 1.5 }, { label: "GO on", width: 4 }, { label: "Description", width: 3.5 }, { label: "Time", width: 0.9 }, { label: "Notes", width: 2.5 }],
          rows: list.map((c) => [c.dept, c.number, c.page ?? "", [c.act, c.scene].filter(Boolean).join(" · "), c.trigger ?? "", c.description ?? "", c.duration ?? "", c.notes ?? ""]),
        }],
      };
    }

    // ------------------------------------------------------------ Breakdown
    case "breakdown": {
      const scenes = await fetchAll<SceneRow>("scenes", "production_id", p.id, "sort_order");
      const rows: string[][] = [];
      const groupRows: number[] = [];
      let lastAct: string | null | undefined;
      scenes.forEach((s) => {
        if (s.act !== lastAct) { groupRows.push(rows.length); rows.push([s.act ?? "", ...BREAKDOWN_COLUMNS.slice(1).map(() => "")]); lastAct = s.act; }
        rows.push(BREAKDOWN_COLUMNS.map((c) => String(s[c.key] ?? "")));
      });
      return {
        title: "SEQUENCE BREAKDOWN", header, subtitle: [p.script_version && `Script Version: ${p.script_version}`, updated()].filter(Boolean).join("   ·   "),
        orientation: "landscape", filename: `${base}-breakdown`, formats: ["docx", "xlsx"],
        blocks: [{ type: "table", columns: BREAKDOWN_COLUMNS.map((c) => ({ label: c.label, width: (c.width ?? 100) / 100 })), rows, groupRows, fontSize: 7 }],
      };
    }

    // ------------------------------------------------------------ Scene chart
    case "scenechart": {
      const scenes = await fetchAll<SceneRow>("scenes", "production_id", p.id, "sort_order");
      const { cols, grid } = sceneChartData(scenes, ctx.characters.map((c) => c.name));
      return {
        title: "SCENE CHART", header, subtitle: updated(), orientation: "landscape", filename: `${base}-scene-chart`, formats: ["xlsx"],
        blocks: [{
          type: "table", fontSize: 7,
          columns: [{ label: "Character", width: 3 }, ...cols.map((c) => ({ label: `${c.label}${c.page ? `\npg. ${c.page}` : ""}`, width: 0.7 })), { label: "Total", width: 0.8 }],
          rows: grid.map((r) => [r.name, ...r.cells.map((on) => (on ? "●" : "")), String(r.cells.filter(Boolean).length)]),
          fills: grid.map((r) => [null, ...r.cells.map((on) => (on ? "fed7aa" : null)), null]),
        }],
      };
    }

    default:
      return extraDoc(kind, ctx, params, header, base);
  }
}

/** Phase 6 documents: props, line notes, sign-in sheet. */
async function extraDoc(kind: ExportKind, ctx: Ctx, params: Params, header: string[], base: string): Promise<DocModel> {
  const p = ctx.production;
  switch (kind) {
    case "props": {
      const list = await fetchAll<Prop>("props", "production_id", p.id, "sort_order");
      return {
        title: "PROPS LIST", header, subtitle: updated(), orientation: "landscape", filename: `${base}-props`, formats: ["docx", "xlsx"],
        blocks: [{
          type: "table",
          columns: [{ label: "Prop", width: 3 }, { label: "Qty", width: 0.6 }, { label: "Type", width: 1.4 }, { label: "Used in", width: 2 }, { label: "Handled by", width: 1.6 }, { label: "Preset", width: 1.8 }, { label: "Source", width: 1.2 }, { label: "Status", width: 1.3 }, { label: "Notes", width: 3 }],
          rows: list.map((x) => [x.name, x.quantity ? String(x.quantity) : "", x.category ?? "", x.scene ?? "", x.character ?? "", x.preset ?? "", x.source ?? "", x.status ?? "", x.notes ?? ""]),
          fills: list.map((x) => [null, null, null, null, null, null, null, x.status === "Show-ready" ? "dcfce7" : x.status === "Needed" || x.status === "Repair" ? "fee2e2" : x.status === "Sourcing" ? "fef3c7" : null, null]),
        }],
      };
    }
    case "linenotes": {
      const all = await fetchAll<LineNote>("line_notes", "production_id", p.id, "date");
      const list = all.filter((n) => !params.date || n.date === params.date).sort((a, b) => (a.character ?? "").localeCompare(b.character ?? "") || Number(a.page ?? 0) - Number(b.page ?? 0));
      const rows: string[][] = [];
      const groupRows: number[] = [];
      let last: string | null = "__";
      list.forEach((n) => {
        if (n.character !== last) {
          const c = ctx.characters.find((x) => x.name === n.character);
          const actor = byId(ctx.members, c?.actor_id)?.display_name;
          groupRows.push(rows.length); rows.push([`${n.character ?? "—"}${actor ? ` · ${actor}` : ""}`, "", "", "", ""]); last = n.character;
        }
        rows.push([fmtDate(n.date, { month: "short", day: "numeric" }), n.page ?? "", n.line ?? "", n.issue ?? "", n.note ?? ""]);
      });
      return {
        title: "LINE NOTES", header, subtitle: params.date ? fmtLongDate(params.date) : updated(), orientation: "portrait",
        filename: `${base}-line-notes${params.date ? `-${params.date}` : ""}`, formats: ["docx", "xlsx"],
        blocks: [{ type: "table", columns: [{ label: "Date", width: 1 }, { label: "Pg", width: 0.6 }, { label: "Line as written", width: 4 }, { label: "Issue", width: 1.5 }, { label: "Said / note", width: 3.5 }], rows, groupRows, fontSize: 9 }],
      };
    }
    case "signin": {
      let date = params.date ?? todayISO();
      let called: Member[] = [];
      let title = "Rehearsal";
      let call = "";
      if (params.eventId) {
        const { data: ev } = await sb().from("events").select("*").eq("id", params.eventId).single();
        const e = ev as ProdEvent;
        date = e.date; title = e.title; call = fmtTime(e.call_time ?? e.start_time);
        const { data: bl } = await sb().from("event_blocks").select("*").eq("event_id", e.id).order("sort_order");
        const blocks = (bl as EventBlock[]) ?? [];
        const ids = new Set<string>();
        blocks.forEach((b) => {
          if (b.called_all) ctx.members.filter((m) => m.role === "actor" || m.department === "Cast").forEach((m) => ids.add(m.id));
          (b.called_ids ?? []).forEach((id) => ids.add(id));
        });
        called = ctx.members.filter((m) => ids.has(m.id));
        const firstCall = (id: string) => blocks.find((b) => b.called_all || b.called_ids?.includes(id))?.start_time ?? null;
        called.sort((a, b) => String(firstCall(a.id)).localeCompare(String(firstCall(b.id))) || a.display_name.localeCompare(b.display_name));
        return signin(called, (m) => fmtTime(firstCall(m.id)) || call);
      }
      called = ctx.members.filter((m) => m.role === "actor" || m.department === "Cast");
      return signin(called, () => call);

      function signin(people: Member[], callFor: (m: Member) => string): DocModel {
        return {
          title: "SIGN-IN SHEET", header, subtitle: `${fmtLongDate(date)} · ${title}`, orientation: "portrait",
          filename: `${base}-sign-in-${date}`, formats: ["docx", "xlsx"],
          blocks: [
            { type: "table", fontSize: 10,
              columns: [{ label: "Name", width: 3 }, { label: "Character / Role", width: 2.5 }, { label: "Call", width: 1.2 }, { label: "Time in", width: 1.2 }, { label: "Signature", width: 2.5 }, { label: "Time out", width: 1.2 }],
              rows: people.map((m) => [m.display_name, ctx.characters.filter((c) => c.actor_id === m.id || c.alternate_id === m.id).map((c) => c.name).join(", ") || m.position || "", callFor(m), "", "\n", ""]),
            },
            { type: "text", title: "Reminders", body: "Please sign in upon arrival. Inform Stage Management of any lateness or absence before call time." },
          ],
        };
      }
    }
    default:
      return { title: kind.toUpperCase(), header, orientation: "portrait", filename: base, formats: [], blocks: [{ type: "text", body: "Unknown document." }] };
  }
}

function hexTint(hex: string) {
  // light tint of an event color for the date cell
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.82).toString(16).padStart(2, "0");
  return mix((n >> 16) & 255) + mix((n >> 8) & 255) + mix(n & 255);
}
