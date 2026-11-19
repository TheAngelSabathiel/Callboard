"use client";
import { useMemo, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { ConfirmButton, Field, Modal, PageHeader } from "@/components/ui";
import { useRows } from "@/lib/useRows";
import { notify } from "@/lib/notify";
import { KIND_ICON, embedUrl, linkKind, linkLabel, normalizeUrl, thumbnail } from "@/lib/links";
import type { LinkItem } from "@/lib/types";
import { cx, fmtDate } from "@/lib/utils";

const CATEGORIES = ["Rehearsal video", "Reference", "Music", "Design", "Script", "Drive folder", "Admin", "Other"];

async function guessTitle(url: string): Promise<string> {
  if (linkKind(url) === "youtube" || linkKind(url) === "vimeo") {
    try {
      const api = linkKind(url) === "youtube"
        ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
        : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
      const r = await fetch(api);
      if (r.ok) { const j = (await r.json()) as { title?: string }; if (j.title) return j.title; }
    } catch { /* offline or blocked: fall back */ }
  }
  return linkLabel(url);
}

export default function LinksPage() {
  const { production, canEdit, userId, members, me } = useProduction();
  const links = useRows<LinkItem>("links", production.id, { order: [{ column: "pinned", ascending: false }, { column: "created_at", ascending: false }] });
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Rehearsal video");
  const [scene, setScene] = useState("");
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [play, setPlay] = useState<LinkItem | null>(null);
  const [edit, setEdit] = useState<LinkItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const mine = (l: LinkItem) => canEdit || l.created_by === userId;
  const who = (l: LinkItem) => members.rows.find((m) => m.user_id === l.created_by)?.display_name ?? "";

  const shown = useMemo(() => links.rows.filter((l) =>
    (!cat || l.category === cat) &&
    (!q || [l.title, l.url, l.scene, l.notes, l.category].join(" ").toLowerCase().includes(q.toLowerCase()))
  ), [links.rows, cat, q]);

  async function add() {
    const u = normalizeUrl(url);
    if (!u || busy) return;
    try { new URL(u); } catch { notify.error("That doesn't look like a link."); return; }
    if (links.rows.some((l) => l.url === u)) { notify.info("Already in Links & Media", u); return; }
    setBusy(true);
    try {
      await links.insert({
        production_id: production.id, url: u, title: title.trim() || await guessTitle(u),
        category, scene: scene.trim() || null, created_by: userId, department: me?.department ?? null,
      });
      setUrl(""); setTitle(""); setScene("");
    } catch { /* toast shown */ }
    setBusy(false);
  }

  const counts = CATEGORIES.map((c) => ({ c, n: links.rows.filter((l) => l.category === c).length })).filter((x) => x.n);
  const canBatch = canEdit && selected.size > 0;

  return (
    <>
      <PageHeader help="links" title="Links & Media" subtitle="Rehearsal videos, references, music, Drive folders and docs, all in one place for the company." />

      <div className="card mb-4 p-3">
        <div className="grid gap-2 md:grid-cols-[2fr_1.5fr_160px_140px_auto]">
          <input className="input" placeholder="Paste a link (YouTube, Drive, Docs, Vimeo, any site)…" value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()} inputMode="url" />
          <input className="input" placeholder="Title (optional, auto-filled)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="input" placeholder="Unit / page" value={scene} onChange={(e) => setScene(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn btn-primary" disabled={!url.trim() || busy} onClick={add}>{busy ? "Adding…" : "Add link"}</button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1">
        <button className={cx("rounded px-2 py-1 text-xs font-semibold", !cat ? "bg-ink text-white" : "bg-white ring-1 ring-paper-line")} onClick={() => setCat("")}>All · {links.rows.length}</button>
        {counts.map(({ c, n }) => (
          <button key={c} className={cx("rounded px-2 py-1 text-xs font-semibold", cat === c ? "bg-ink text-white" : "bg-white ring-1 ring-paper-line")} onClick={() => setCat(c)}>{c} · {n}</button>
        ))}
        <input className="input ml-auto w-48 py-1 text-xs" placeholder="Search links…" value={q} onChange={(e) => setQ(e.target.value)} />
        {canBatch && (
          <span className="flex items-center gap-2 rounded-md bg-ink px-2 py-1 text-xs text-white">
            {selected.size} selected
            <ConfirmButton className="bg-white text-red-700" label={`Delete ${selected.size}?`} onConfirm={async () => { await links.removeMany(Array.from(selected)); setSelected(new Set()); }}>Delete</ConfirmButton>
            <button className="underline" onClick={() => setSelected(new Set())}>Clear</button>
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-mute">{links.rows.length ? "No links match." : "No links yet. Paste the latest run video or the rehearsal Drive folder to start."}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((l) => {
            const thumb = thumbnail(l.url);
            const kind = linkKind(l.url);
            const playable = !!embedUrl(l.url);
            return (
              <div key={l.id} className={cx("card flex flex-col overflow-hidden", l.pinned && "ring-2 ring-cue/40", selected.has(l.id) && "ring-2 ring-ink")}>
                <button className="relative block aspect-video w-full bg-ink text-left" onClick={() => (playable ? setPlay(l) : window.open(l.url, "_blank", "noopener"))}>
                  {thumb
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={thumb} alt="" className="h-full w-full object-cover opacity-90" loading="lazy" />
                    : <span className="flex h-full w-full items-center justify-center text-4xl text-white/70">{KIND_ICON[kind]}</span>}
                  <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">{playable ? "▶ Play here" : "Open ↗"}</span>
                  {l.pinned && <span className="absolute right-2 top-2 rounded bg-cue px-1.5 py-0.5 text-[11px] font-bold text-white">📌 Pinned</span>}
                </button>
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-start gap-2">
                    {canEdit && <input type="checkbox" className="mt-1" checked={selected.has(l.id)} onChange={() => setSelected((cur) => { const n = new Set(cur); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} />}
                    <div className="min-w-0 flex-1">
                      <a href={l.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-semibold hover:underline">{l.title || linkLabel(l.url)}</a>
                      <p className="truncate text-xs text-ink-mute">{linkLabel(l.url)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    <span className="chip bg-paper text-ink-soft">{l.category}</span>
                    {l.scene && <span className="chip bg-cue-soft text-cue">{l.scene}</span>}
                  </div>
                  {l.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-ink-soft">{l.notes}</p>}
                  <p className="mt-auto pt-2 text-[11px] text-ink-mute">{who(l) ? `${who(l)} · ` : ""}{fmtDate(l.created_at.slice(0, 10))}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button className="btn btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(l.url); notify.info("Link copied"); } catch { /* ignore */ } }}>Copy</button>
                    {mine(l) && <button className="btn btn-sm" onClick={() => links.update(l.id, { pinned: !l.pinned })}>{l.pinned ? "Unpin" : "📌 Pin"}</button>}
                    {mine(l) && <button className="btn btn-sm" onClick={() => setEdit(l)}>Edit</button>}
                    {mine(l) && <ConfirmButton onConfirm={() => links.remove(l.id)}>Delete</ConfirmButton>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {play && (
        <Modal open onClose={() => setPlay(null)} title={play.title || linkLabel(play.url)} wide>
          <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
            <iframe src={embedUrl(play.url)!} className="h-full w-full" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen title={play.title} />
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <span className="text-ink-mute">{play.scene ? `${play.scene} · ` : ""}{play.category}</span>
            <a className="underline" href={play.url} target="_blank" rel="noreferrer">Open original ↗</a>
          </div>
          <p className="mt-1 text-[11px] text-ink-mute">Private Drive videos only play for people with access to the file.</p>
        </Modal>
      )}

      {edit && <EditLink link={edit} onClose={() => setEdit(null)} onSave={async (p) => { await links.update(edit.id, p); setEdit(null); }} />}
    </>
  );
}

function EditLink({ link, onClose, onSave }: { link: LinkItem; onClose: () => void; onSave: (p: Partial<LinkItem>) => Promise<void> }) {
  const [f, setF] = useState({ title: link.title, url: link.url, category: link.category, scene: link.scene ?? "", notes: link.notes ?? "" });
  return (
    <Modal open onClose={onClose} title="Edit link">
      <div className="space-y-3">
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Link"><input className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Unit / page"><input className="input" value={f.scene} onChange={(e) => setF({ ...f, scene: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><textarea className="input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. Watch 12:30 to 18:00 for the Act 2 blocking change" /></Field>
        <button className="btn btn-primary w-full" onClick={() => onSave({ title: f.title, url: normalizeUrl(f.url), category: f.category, scene: f.scene || null, notes: f.notes || null })}>Save</button>
      </div>
    </Modal>
  );
}
