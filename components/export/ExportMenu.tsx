"use client";
import { useEffect, useRef, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { type ExportKind, KIND_FORMATS, buildDoc } from "@/lib/export/loaders";
import { downloadBlob, googleEnabled, uploadToGoogle } from "@/lib/export/google";

/** Export dropdown: Print / PDF, Word, Excel, Google Docs, Google Sheets. */
export function ExportMenu({ kind, params = {}, label = "Export" }: {
  kind: string; productionId?: string; params?: Record<string, string>; label?: string;
}) {
  const { production, members, characters } = useProduction();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const k = kind as ExportKind;
  const formats = KIND_FORMATS[k] ?? [];

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const qs = new URLSearchParams(params).toString();
  const printHref = `/p/${production.id}/print/${kind}${qs ? `?${qs}` : ""}`;
  const ctx = { production, members: members.rows, characters: characters.rows };

  async function run(target: "docx" | "xlsx" | "gdoc" | "gsheet") {
    setErr(null); setLink(null); setBusy(target);
    try {
      const doc = await buildDoc(k, ctx, params);
      if (target === "docx" || target === "gdoc") {
        const { toDocxBlob } = await import("@/lib/export/docx");
        const blob = await toDocxBlob(doc);
        if (target === "docx") downloadBlob(blob, `${doc.filename}.docx`);
        else setLink(await uploadToGoogle(blob, `${production.title} · ${doc.title}`, "doc"));
      } else {
        const { toXlsxBlob } = await import("@/lib/export/xlsx");
        const blob = await toXlsxBlob(doc);
        if (target === "xlsx") downloadBlob(blob, `${doc.filename}.xlsx`);
        else setLink(await uploadToGoogle(blob, `${production.title} · ${doc.title}`, "sheet"));
      }
    } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  }

  const item = "flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm hover:bg-paper disabled:opacity-50";

  return (
    <div ref={ref} className="no-print relative">
      <button className="btn" onClick={() => setOpen(!open)}>{busy ? "Preparing…" : `${label} ▾`}</button>
      {open && (
        <div className="card absolute right-0 z-40 mt-1 w-64 p-1">
          <a className={item} href={printHref} target="_blank" rel="noreferrer">Print / Save as PDF <span className="text-xs text-ink-mute">⎙</span></a>
          {formats.includes("docx") && <button className={item} disabled={!!busy} onClick={() => run("docx")}>Word (.docx) <span className="text-xs text-ink-mute">↓</span></button>}
          {formats.includes("xlsx") && <button className={item} disabled={!!busy} onClick={() => run("xlsx")}>Excel (.xlsx) <span className="text-xs text-ink-mute">↓</span></button>}
          {googleEnabled() && (
            <>
              <div className="my-1 border-t border-paper-line" />
              {formats.includes("docx") && <button className={item} disabled={!!busy} onClick={() => run("gdoc")}>Open in Google Docs <span className="text-xs text-ink-mute">↗</span></button>}
              {formats.includes("xlsx") && <button className={item} disabled={!!busy} onClick={() => run("gsheet")}>Open in Google Sheets <span className="text-xs text-ink-mute">↗</span></button>}
            </>
          )}
          {busy && <p className="px-3 py-1 text-xs text-ink-mute">Building {busy === "gdoc" || busy === "gsheet" ? "and uploading " : ""}file…</p>}
          {link && <a className="block rounded bg-green-50 px-3 py-2 text-sm font-semibold text-go underline" href={link} target="_blank" rel="noreferrer">Saved to Google Drive · Open ↗</a>}
          {err && <p className="px-3 py-1 text-xs text-red-700">{err}</p>}
        </div>
      )}
    </div>
  );
}
