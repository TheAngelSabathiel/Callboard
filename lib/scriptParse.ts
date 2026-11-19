import type { LineKind } from "./types";

export type ParsedLine = {
  idx: number;
  page: number;
  act: string | null;
  scene: string | null;
  kind: LineKind;
  speaker: string | null;
  text: string;
};

export type ParseOptions = {
  /** Detect page markers like "Page 12", "pg. 12", "=== PAGE 12 ===", form feeds or a lone page number. */
  detectPages: boolean;
  /** Fallback: start a new page every N non-blank lines when no markers are found. 0 = off. */
  linesPerPage: number;
  /** Known character names (improves speaker detection). */
  characters: string[];
};

const ACT_RE = /^\s*(ACT|AKTO|YUGTO|KABANATA)\s+([IVXLC]+|\d+|[A-Z]+)\b.*$/i;
const SCENE_RE = /^\s*(SCENE|EKSENA|TAGPO|UNIT|EKS\.)\s+([IVXLC]+|\d+(\.\d+)?|[A-Z]+)\b.*$/i;
const PAGE_RE = /^\s*(?:={2,}\s*)?(?:page|pg\.?|pahina)\s*#?\s*(\d+)\s*(?:={2,})?\s*$/i;
const LONE_NUM_RE = /^\s*(\d{1,3})\.?\s*$/;
const SPEAKER_COLON_RE = /^\s*([A-ZÑÁÉÍÓÚ][A-Za-zÑñÁÉÍÓÚáéíóú .'\-/&]{0,40}?)\s*(\([^)]*\))?\s*:\s*(.*)$/;
const DIRECTION_RE = /^\s*[\(\[].*[\)\]]\s*$/;

function isAllCapsName(s: string) {
  const t = s.trim();
  if (!t || t.length > 32) return false;
  if (!/[A-ZÑ]/.test(t)) return false;
  return t === t.toUpperCase() && /^[A-ZÑÁÉÍÓÚ .'\-/&()]+$/.test(t);
}

export function parseScript(raw: string, opts: ParseOptions): ParsedLine[] {
  const known = opts.characters.map((c) => c.trim().toUpperCase()).filter(Boolean);
  const text = raw.replace(/\r\n?/g, "\n");
  const rawLines = text.split("\n");
  const out: ParsedLine[] = [];
  let page = 1;
  let act: string | null = null;
  let scene: string | null = null;
  let speaker: string | null = null;
  let sawMarker = false;
  let sinceBreak = 0;
  let pendingBlank = false;

  const push = (l: Omit<ParsedLine, "idx" | "page" | "act" | "scene">) => {
    if (pendingBlank && out.length && out[out.length - 1].kind !== "blank") {
      out.push({ idx: out.length, page, act, scene, kind: "blank", speaker: null, text: "" });
    }
    pendingBlank = false;
    out.push({ idx: out.length, page, act, scene, ...l });
    sinceBreak++;
    if (!sawMarker && opts.linesPerPage > 0 && sinceBreak >= opts.linesPerPage) { page++; sinceBreak = 0; }
  };

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    if (opts.detectPages && line.includes("\f")) {
      const parts = line.split("\f");
      line = parts[parts.length - 1];
      if (out.length) { page += parts.length - 1; sinceBreak = 0; sawMarker = true; }
    }
    const t = line.trim();
    if (!t) { pendingBlank = true; speaker = null; continue; }

    if (opts.detectPages) {
      const pm = t.match(PAGE_RE);
      if (pm) { page = Number(pm[1]); sinceBreak = 0; sawMarker = true; continue; }
      const prevBlank = i === 0 || !rawLines[i - 1].trim();
      const nextBlank = i === rawLines.length - 1 || !rawLines[i + 1].trim();
      const lm = t.match(LONE_NUM_RE);
      if (lm && prevBlank && nextBlank && Number(lm[1]) >= page && Number(lm[1]) <= page + 2) {
        page = Number(lm[1]); sinceBreak = 0; sawMarker = true; continue;
      }
    }

    const am = t.match(ACT_RE);
    if (am && t.length < 60) { act = `ACT ${am[2].toUpperCase()}`; scene = null; speaker = null; push({ kind: "heading", speaker: null, text: t }); continue; }
    const sm = t.match(SCENE_RE);
    if (sm && t.length < 80) { scene = `${sm[1].toUpperCase()} ${sm[2].toUpperCase()}`; speaker = null; push({ kind: "heading", speaker: null, text: t }); continue; }

    if (DIRECTION_RE.test(t)) { push({ kind: "direction", speaker: null, text: t }); continue; }

    const cm = t.match(SPEAKER_COLON_RE);
    if (cm) {
      const name = cm[1].trim();
      const upper = name.toUpperCase();
      const looksLikeName = known.includes(upper) || isAllCapsName(name) || (name.split(/\s+/).length <= 3 && /^[A-ZÑ]/.test(name) && known.length === 0);
      if (looksLikeName && cm[3] !== undefined) {
        speaker = upper;
        const body = [cm[2], cm[3]].filter(Boolean).join(" ").trim();
        push({ kind: "dialogue", speaker, text: body });
        continue;
      }
    }

    if (isAllCapsName(t) && (known.length === 0 || known.includes(t.replace(/\(.*\)/, "").trim().toUpperCase()))) {
      speaker = t.replace(/\(.*\)/, "").trim().toUpperCase();
      push({ kind: "character", speaker, text: t });
      continue;
    }

    push({ kind: speaker ? "dialogue" : "direction", speaker, text: t });
  }
  return out;
}

export const BLOCKING_SHORTHAND = [
  "X", "ENT", "EXT", "DS", "US", "SL", "SR", "DSL", "DSR", "USL", "USR", "C", "CS", "DC", "UC",
  "→", "←", "sits", "rises", "kneels", "turns", "pause", "beat", "LIGHTS", "MX",
];

export const CUE_DEPTS: { value: string; label: string; color: string }[] = [
  { value: "LX", label: "Lights", color: "#2563eb" },
  { value: "SQ", label: "Sound", color: "#16a34a" },
  { value: "MX", label: "Music", color: "#0d9488" },
  { value: "VQ", label: "Video", color: "#7c3aed" },
  { value: "FLY", label: "Fly / Rail", color: "#b45309" },
  { value: "SPOT", label: "Follow spot", color: "#ca8a04" },
  { value: "DECK", label: "Deck / Shift", color: "#475569" },
  { value: "FX", label: "Effects", color: "#db2777" },
  { value: "SM", label: "SM / Other", color: "#c2410c" },
];
export const deptColor = (d: string) => CUE_DEPTS.find((x) => x.value === d)?.color ?? "#6b7080";

export const HIGHLIGHTS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa"];
