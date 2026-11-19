import type { Borders, Workbook, Worksheet } from "exceljs";
import type { Block, DocModel } from "./model";

const thin = { style: "thin" as const, color: { argb: "FF999999" } };
const BORDER: Partial<Borders> = { top: thin, bottom: thin, left: thin, right: thin };

/** Renders the doc model into one worksheet, top to bottom, sized for printing. */
export async function docModelToWorkbook(m: DocModel): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Callboard";
  wb.created = new Date();
  const ws = wb.addWorksheet(m.title.slice(0, 31).replace(/[\\/*?:[\]]/g, "") || "Sheet1", {
    pageSetup: {
      orientation: m.orientation, paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: { oddFooter: `&C${m.title.replace(/&/g, "&&")} · Page &P of &N` },
  });

  const width = Math.max(4, ...m.blocks.map((b) => (b.type === "table" ? b.columns.length : b.type === "kv" ? (b.columns ?? 2) : 1)));
  let r = 1;
  const merge = (row: number) => { if (width > 1) ws.mergeCells(row, 1, row, width); };

  m.header.forEach((h, i) => {
    const c = ws.getCell(r, 1); c.value = h;
    c.font = { bold: i === 0, size: i === 0 ? 14 : 10 };
    c.alignment = { horizontal: "center" };
    merge(r); r++;
  });
  const t = ws.getCell(r, 1); t.value = m.title; t.font = { bold: true, size: 13, color: { argb: "FFC2410C" } }; t.alignment = { horizontal: "center" }; merge(r); r++;
  if (m.subtitle) { const s = ws.getCell(r, 1); s.value = m.subtitle; s.font = { italic: true, size: 9 }; s.alignment = { horizontal: "center", wrapText: true }; merge(r); r++; }
  r++;

  let widthsSet = false;
  for (const b of m.blocks) {
    r = writeBlock(ws, b, r, width);
    if (b.type === "table" && !widthsSet) {
      const total = b.columns.reduce((s, c) => s + (c.width ?? 1), 0);
      const target = m.orientation === "landscape" ? 190 : 120;
      b.columns.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(5.5, Math.round(((c.width ?? 1) / total) * target)); });
      widthsSet = true;
      ws.views = [{ state: "frozen", ySplit: 0, xSplit: b.columns.length > 12 ? 2 : 0 }];
    }
  }
  if (!widthsSet) for (let i = 1; i <= width; i++) ws.getColumn(i).width = 26;
  return wb;
}

function writeBlock(ws: Worksheet, b: Block, r: number, width: number): number {
  switch (b.type) {
    case "heading": {
      const c = ws.getCell(r, 1); c.value = b.text; c.font = { bold: true, size: 12 }; return r + 1;
    }
    case "pagebreak":
      ws.getRow(r - 1).addPageBreak(); return r;
    case "text": {
      if (b.title) { const c = ws.getCell(r, 1); c.value = b.title; c.font = { bold: true, color: b.flag ? { argb: "FFC2410C" } : undefined }; r++; }
      const c = ws.getCell(r, 1); c.value = b.body; c.alignment = { wrapText: true, vertical: "top" };
      if (width > 1) ws.mergeCells(r, 1, r, width);
      ws.getRow(r).height = Math.min(400, 15 * Math.max(1, b.body.split("\n").length + Math.floor(b.body.length / 140)));
      return r + 2;
    }
    case "signature": {
      r++;
      b.labels.forEach((l, i) => { const c = ws.getCell(r, 1 + i * 2); c.value = `${l}  ____________________`; });
      return r + 2;
    }
    case "kv": {
      const per = (b.columns ?? 2) / 2;
      for (let i = 0; i < b.rows.length; i += per) {
        b.rows.slice(i, i + per).forEach(([k, v], j) => {
          const kc = ws.getCell(r, 1 + j * 2); kc.value = k; kc.font = { bold: true }; kc.border = BORDER;
          kc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1EDE4" } };
          const vc = ws.getCell(r, 2 + j * 2); vc.value = v; vc.border = BORDER; vc.alignment = { wrapText: true, vertical: "top" };
        });
        r++;
      }
      return r + 1;
    }
    case "table": {
      if (b.title) { const c = ws.getCell(r, 1); c.value = b.title; c.font = { bold: true }; r++; }
      const head = ws.getRow(r);
      b.columns.forEach((col, i) => {
        const c = head.getCell(i + 1);
        c.value = col.label; c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16181D" } };
        c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; c.border = BORDER;
      });
      head.height = b.columns.some((c) => c.label.includes("\n")) ? 28 : 18;
      const headerRow = r;
      r++;
      const groups = new Set(b.groupRows ?? []);
      b.rows.forEach((row, ri) => {
        const xr = ws.getRow(r);
        if (groups.has(ri)) {
          const c = xr.getCell(1); c.value = row[0]; c.font = { bold: true };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6E1D7" } };
          ws.mergeCells(r, 1, r, b.columns.length);
        } else {
          let lines = 1;
          b.columns.forEach((_, ci) => {
            const c = xr.getCell(ci + 1);
            const v = row[ci] ?? "";
            c.value = v;
            c.alignment = { wrapText: true, vertical: "top", horizontal: b.columns.length > 12 && ci > 1 ? "center" : undefined };
            c.border = BORDER;
            c.font = { size: Math.max(8, (b.fontSize ?? 10)), name: b.monoCol === ci ? "Courier New" : undefined };
            const fill = b.fills?.[ri]?.[ci];
            if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${fill.slice(0, 6).toUpperCase()}` } };
            lines = Math.max(lines, v.split("\n").length);
          });
          if (lines > 1) xr.height = Math.min(300, 13 * lines);
        }
        r++;
      });
      ws.autoFilter = undefined;
      // repeat the header row on every printed page
      ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
      return r + 1;
    }
  }
}

export async function toXlsxBlob(m: DocModel): Promise<Blob> {
  const wb = await docModelToWorkbook(m);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
