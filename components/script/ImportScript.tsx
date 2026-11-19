"use client";
import { notify } from "@/lib/notify";
import { useMemo, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { ErrorNote, Field, Modal } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { insertChunked } from "@/lib/fetchAll";
import { parseScript } from "@/lib/scriptParse";
import type { Script } from "@/lib/types";

export function ImportScript({ onClose, onDone }: { onClose: () => void; onDone: (s: Script) => void }) {
  const { production, characters, userId } = useProduction();
  const [raw, setRaw] = useState("");
  const [title, setTitle] = useState(production.title);
  const [version, setVersion] = useState(production.script_version ?? "");
  const [detectPages, setDetectPages] = useState(true);
  const [lpp, setLpp] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const parsed = useMemo(() => raw ? parseScript(raw, { detectPages, linesPerPage: lpp, characters: characters.rows.map((c) => c.name) }) : [], [raw, detectPages, lpp, characters.rows]);
  const pages = parsed.length ? parsed[parsed.length - 1].page : 0;
  const speakers = useMemo(() => {
    const m = new Map<string, number>();
    parsed.forEach((l) => l.speaker && l.kind === "dialogue" && m.set(l.speaker, (m.get(l.speaker) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [parsed]);

  async function onFile(f: File) {
    setErr(null);
    try {
      if (f.name.toLowerCase().endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
        setRaw(value);
      } else {
        setRaw(await f.text());
      }
    } catch (e) { setErr(`Could not read file: ${(e as Error).message}`); }
  }

  async function doImport() {
    setErr(null);
    try {
      setProgress("Creating script…");
      const sb = supabaseBrowser();
      const { data, error } = await sb.from("scripts").insert({ production_id: production.id, title, version: version || null, is_current: true, created_by: userId }).select("*").single();
      if (error) throw error;
      const script = data as Script;
      await insertChunked("script_lines", parsed.map((l) => ({ ...l, script_id: script.id, production_id: production.id })), 500,
        (n) => setProgress(`Saving lines ${n}/${parsed.length}…`));
      notify.created("Script", `${parsed.length} lines · ${pages} pages`);
      onDone(script);
    } catch (e) { setErr((e as Error).message); setProgress(null); }
  }

  return (
    <Modal open onClose={onClose} title="Import script" wide>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Version"><input className="input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Abridged, rev. Nov 12" /></Field>
        </div>
        <Field label="Upload .docx or .txt, or paste below">
          <input type="file" accept=".txt,.docx,.md,.fountain" className="input" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </Field>
        <textarea className="input h-48 font-script text-xs" value={raw} onChange={(e) => setRaw(e.target.value)}
          placeholder={"ACT I\n\nPage 2\n\n(Actors are covered in gauze.)\n\nBITOY: Intramuros…\nCANDIDO: Bitoy! Is that you?"} />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={detectPages} onChange={(e) => setDetectPages(e.target.checked)} /> Detect page markers (“Page 12”, “pg. 12”, page breaks)</label>
          <label className="flex items-center gap-1.5">Fallback lines/page <input className="input w-20 py-1" type="number" min={0} value={lpp} onChange={(e) => setLpp(Number(e.target.value))} /></label>
        </div>
        {parsed.length > 0 && (
          <div className="rounded-md bg-paper p-3 text-xs">
            <p><b>{parsed.length}</b> lines · <b>{pages}</b> pages · <b>{speakers.length}</b> speakers detected</p>
            <p className="mt-1 text-ink-mute">{speakers.slice(0, 20).map(([s, n]) => `${s} (${n})`).join(", ")}</p>
            <div className="mt-2 max-h-40 overflow-y-auto rounded border border-paper-line bg-white p-2 font-script">
              {parsed.slice(0, 60).map((l) => (
                <p key={l.idx} className={l.kind === "heading" ? "font-bold" : l.kind === "direction" ? "italic text-ink-mute" : ""}>
                  <span className="mr-2 text-ink-mute">p{l.page}</span>{l.speaker && l.kind === "dialogue" ? <b>{l.speaker}: </b> : null}{l.text}
                </p>
              ))}
            </div>
            <p className="mt-2 text-ink-mute">Tip: add characters in Company &amp; Cast first so speaker names are recognized. Lines can be edited after import.</p>
          </div>
        )}
        <ErrorNote msg={err} />
        <button className="btn btn-primary w-full" disabled={!parsed.length || !!progress} onClick={doImport}>{progress ?? "Import as current script"}</button>
      </div>
    </Modal>
  );
}
