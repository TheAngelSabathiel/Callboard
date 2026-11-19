import {
  AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber, PageOrientation, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import type { Block, DocModel } from "./model";

const A4 = { w: 11906, h: 16838 };
const MARGIN = 720; // 0.5 inch
const FONT = "Arial";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function runs(text: string, opts: { bold?: boolean; size?: number; italics?: boolean; color?: string; font?: string } = {}) {
  const parts = (text ?? "").split("\n");
  return parts.map((t, i) => new TextRun({ text: t, bold: opts.bold, italics: opts.italics, size: opts.size, color: opts.color, font: opts.font ?? FONT, break: i > 0 ? 1 : undefined }));
}

function para(text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; italics?: boolean; color?: string; font?: string } = {}) {
  return new Paragraph({ alignment: opts.align, spacing: { after: opts.after ?? 60, before: opts.before ?? 0 }, children: runs(text, opts) });
}

function blockToDocx(b: Block, contentWidth: number): (Paragraph | Table)[] {
  switch (b.type) {
    case "heading":
      return [para(b.text, { bold: true, size: b.level === 2 ? 22 : 26, before: 200, after: 80 })];
    case "pagebreak":
      return [new Paragraph({ pageBreakBefore: true, children: [] })];
    case "text":
      return [
        ...(b.title ? [para(b.title, { bold: true, size: 21, before: 180, after: 40, color: b.flag ? "C2410C" : undefined })] : []),
        para(b.body, { size: 20, after: 100 }),
      ];
    case "signature": {
      const w = Math.floor(contentWidth / b.labels.length);
      return [
        new Paragraph({ spacing: { before: 400 }, children: [] }),
        new Table({
          width: { size: contentWidth, type: WidthType.DXA },
          columnWidths: b.labels.map(() => w),
          rows: [new TableRow({
            children: b.labels.map((l) => new TableCell({
              width: { size: w, type: WidthType.DXA },
              borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
              children: [para("\n\n______________________________", { size: 20 }), para(l, { size: 18 })],
            })),
          })],
        }),
      ];
    }
    case "kv": {
      const cols = b.columns ?? 2;
      const pairsPerRow = cols / 2;
      const labelW = Math.floor(contentWidth * (cols === 4 ? 0.13 : 0.25));
      const valW = Math.floor(contentWidth / pairsPerRow) - labelW;
      const widths = Array.from({ length: pairsPerRow }).flatMap(() => [labelW, valW]);
      const rows: TableRow[] = [];
      for (let i = 0; i < b.rows.length; i += pairsPerRow) {
        const slice = b.rows.slice(i, i + pairsPerRow);
        while (slice.length < pairsPerRow) slice.push(["", ""]);
        rows.push(new TableRow({
          children: slice.flatMap(([k, v], j) => [
            new TableCell({ width: { size: widths[j * 2], type: WidthType.DXA }, borders: CELL_BORDERS, shading: { type: ShadingType.CLEAR, fill: "F1EDE4", color: "auto" }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [para(k, { bold: true, size: 18, after: 0 })] }),
            new TableCell({ width: { size: widths[j * 2 + 1], type: WidthType.DXA }, borders: CELL_BORDERS, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [para(v, { size: 18, after: 0 })] }),
          ]),
        }));
      }
      return [new Table({ width: { size: contentWidth, type: WidthType.DXA }, columnWidths: widths, rows }), new Paragraph({ spacing: { after: 120 }, children: [] })];
    }
    case "table": {
      const total = b.columns.reduce((s, c) => s + (c.width ?? 1), 0);
      const widths = b.columns.map((c) => Math.max(300, Math.floor(((c.width ?? 1) / total) * contentWidth)));
      const sz = (b.fontSize ?? 9) * 2;
      const head = new TableRow({
        tableHeader: true,
        children: b.columns.map((c, i) => new TableCell({
          width: { size: widths[i], type: WidthType.DXA }, borders: CELL_BORDERS,
          shading: { type: ShadingType.CLEAR, fill: "16181D", color: "auto" },
          margins: { top: 40, bottom: 40, left: 60, right: 60 },
          children: [para(c.label, { bold: true, size: sz, color: "FFFFFF", after: 0 })],
        })),
      });
      const groups = new Set(b.groupRows ?? []);
      const body = b.rows.map((r, ri) => {
        if (groups.has(ri)) {
          return new TableRow({
            cantSplit: true,
            children: [new TableCell({
              columnSpan: b.columns.length, width: { size: contentWidth, type: WidthType.DXA }, borders: CELL_BORDERS,
              shading: { type: ShadingType.CLEAR, fill: "E6E1D7", color: "auto" }, margins: { top: 40, bottom: 40, left: 60, right: 60 },
              children: [para(r[0], { bold: true, size: sz, after: 0 })],
            })],
          });
        }
        return new TableRow({
          cantSplit: r.join("").length < 600,
          children: b.columns.map((_, ci) => {
            const fill = b.fills?.[ri]?.[ci];
            return new TableCell({
              width: { size: widths[ci], type: WidthType.DXA }, borders: CELL_BORDERS,
              shading: fill ? { type: ShadingType.CLEAR, fill: fill.slice(0, 6).toUpperCase(), color: "auto" } : undefined,
              margins: { top: 30, bottom: 30, left: 60, right: 60 },
              children: [para(r[ci] ?? "", { size: sz, after: 0, font: b.monoCol === ci ? "Courier New" : undefined })],
            });
          }),
        });
      });
      return [
        ...(b.title ? [para(b.title, { bold: true, size: 21, before: 160, after: 60 })] : []),
        new Table({ width: { size: contentWidth, type: WidthType.DXA }, columnWidths: widths, rows: [head, ...body] }),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
    }
  }
}

export function docModelToDocument(m: DocModel) {
  const landscape = m.orientation === "landscape";
  const pageW = landscape ? A4.h : A4.w;
  const contentWidth = pageW - MARGIN * 2;
  const children: (Paragraph | Table)[] = [
    ...m.header.map((h, i) => para(h, { bold: i === 0, size: i === 0 ? 28 : 18, align: AlignmentType.CENTER, after: 20 })),
    para(m.title, { bold: true, size: 26, align: AlignmentType.CENTER, before: 160, after: 20, color: "C2410C" }),
    ...(m.subtitle ? [para(m.subtitle, { size: 18, align: AlignmentType.CENTER, after: 200, italics: true })] : [new Paragraph({ spacing: { after: 160 }, children: [] })]),
    ...m.blocks.flatMap((b) => blockToDocx(b, contentWidth)),
  ];
  return new Document({
    creator: "Callboard",
    title: `${m.header[0] ?? ""} ${m.title}`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: A4.w, height: A4.h, orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${m.header[0] ?? ""} · ${m.title} · Page `, size: 14, color: "6B7080", font: FONT }),
              new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "6B7080", font: FONT }),
              new TextRun({ text: " of ", size: 14, color: "6B7080", font: FONT }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: "6B7080", font: FONT }),
            ],
          })],
        }),
      },
      children,
    }],
  });
}

export async function toDocxBlob(m: DocModel): Promise<Blob> {
  return Packer.toBlob(docModelToDocument(m));
}
