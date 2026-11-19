/**
 * One document model, three outputs: print view (HTML), Word (.docx), Excel (.xlsx).
 * Google Docs / Sheets get the .docx / .xlsx uploaded with conversion.
 */
export type Column = { label: string; width?: number /* relative weight */ };

export type Block =
  | { type: "heading"; text: string; level?: 1 | 2 }
  | { type: "kv"; rows: [string, string][]; columns?: 2 | 4 }
  | { type: "text"; title?: string; body: string; flag?: boolean }
  | {
      type: "table";
      title?: string;
      columns: Column[];
      rows: string[][];
      /** Optional background color per cell (hex without #) */
      fills?: (string | null)[][];
      /** Row indexes rendered as full-width group headers (first cell text used) */
      groupRows?: number[];
      fontSize?: number; // pt for print/docx
      monoCol?: number; // column index rendered in script font
    }
  | { type: "signature"; labels: string[] }
  | { type: "pagebreak" };

export type DocModel = {
  /** Document kind label, e.g. "REHEARSAL REPORT #12" */
  title: string;
  /** Production header lines: title, produced by, etc. */
  header: string[];
  /** Small line under the title, e.g. date */
  subtitle?: string;
  orientation: "portrait" | "landscape";
  blocks: Block[];
  filename: string;
  footer?: string;
  /** Formats offered in the export menu */
  formats: ("docx" | "xlsx")[];
};

export function productionHeader(p: { title: string; subtitle?: string | null; produced_by?: string | null; directed_by?: string | null; show_dates?: string | null; script_version?: string | null }) {
  return [
    p.title.toUpperCase(),
    p.subtitle ?? "",
    [p.produced_by && `Produced by: ${p.produced_by}`, p.directed_by && `Directed by: ${p.directed_by}`].filter(Boolean).join("   ·   "),
    p.show_dates ?? "",
  ].filter(Boolean);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
