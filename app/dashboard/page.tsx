"use client";
import { notify } from "@/lib/notify";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Member, Production, Task } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/roles";
import { ErrorNote, Field, HelpButton, Modal } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

type MyTask = Task & { production_title: string };

export default function Dashboard() {
  const router = useRouter();
  const [prods, setProds] = useState<Production[]>([]);
  const [roles, setRoles] = useState<Record<string, Member>>({});
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await sb.from("profiles").select("full_name").eq("id", u.user.id).single();
      setName(prof?.full_name ?? u.user.email ?? "");
      const [{ data: p }, { data: m }] = await Promise.all([
        sb.from("productions").select("*").order("created_at", { ascending: false }),
        sb.from("members").select("*").eq("user_id", u.user.id),
      ]);
      const list = (p as Production[]) ?? [];
      setProds(list);
      const map: Record<string, Member> = {};
      ((m as Member[]) ?? []).forEach((x) => (map[x.production_id] = x));
      setRoles(map);
      const ids = Object.values(map).map((x) => x.id);
      if (ids.length) {
        const { data: t } = await sb.from("tasks").select("*").in("assignee_id", ids).neq("status", "done").order("due_date", { ascending: true, nullsFirst: false });
        setTasks(((t as Task[]) ?? []).map((x) => ({ ...x, production_title: list.find((pp) => pp.id === x.production_id)?.title ?? "" })));
      }
      setLoading(false);
    })();
  }, []);

  const visible = prods.filter((p) => showArchived || !p.archived);

  return (
    <div className="min-h-screen">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-cue">Callboard</p>
          <div className="flex items-center gap-2">
            <Link href="/account" className="text-sm text-white/80 hover:text-white">{name}</Link>
            <form action="/auth/signout" method="post">
              <button className="btn btn-sm border-white/20 bg-transparent text-white hover:bg-white/10">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><h1 className="h-page">Productions</h1><HelpButton topic="dashboard" /></div>
            <p className="text-sm text-ink-mute">Shows you manage or belong to.</p>
          </div>
          <div className="flex gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ink-mute">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
            </label>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>+ New production</button>
          </div>
        </div>

        {loading ? <p className="text-sm text-ink-mute">Loading…</p> : visible.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="font-semibold">No productions yet</p>
            <p className="mt-1 text-sm text-ink-mute">Create one and you become its Head SM. Or ask your Head SM to add your email to the company list.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="card group p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="mb-3 h-1 w-10 rounded" style={{ background: p.accent_color || "#c2410c" }} />
                <p className="font-bold leading-snug group-hover:underline">{p.title}</p>
                {p.produced_by && <p className="mt-0.5 text-xs text-ink-mute">{p.produced_by}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {roles[p.id] && <span className="chip bg-cue-soft text-cue">{ROLE_LABEL[roles[p.id].role]}</span>}
                  {p.show_dates && <span className="text-ink-mute">{p.show_dates}</span>}
                  {p.archived && <span className="chip bg-paper text-ink-mute">Archived</span>}
                </div>
              </Link>
            ))}
          </div>
        )}

        <h2 className="mb-3 mt-10 text-lg font-bold">My open tasks</h2>
        {tasks.length === 0 ? <p className="text-sm text-ink-mute">Nothing assigned to you.</p> : (
          <div className="card divide-y divide-paper-line">
            {tasks.map((t) => (
              <Link key={t.id} href={`/p/${t.production_id}/tasks`} className="flex items-center justify-between gap-3 p-3 hover:bg-paper">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-ink-mute">{t.production_title}</p>
                </div>
                <span className="shrink-0 text-xs text-ink-mute">{t.due_date ? `Due ${fmtDate(t.due_date)}` : ""}</span>
              </Link>
            ))}
          </div>
        )}
      </main>

      <NewProduction open={open} productions={prods} onClose={() => setOpen(false)} onCreated={(id) => router.push(`/p/${id}`)} />
    </div>
  );
}

function NewProduction({ open, onClose, onCreated, productions }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; productions: Production[] }) {
  const [f, setF] = useState({ title: "", produced_by: "", directed_by: "", venue: "", show_dates: "" });
  const [src, setSrc] = useState("");
  const [copy, setCopy] = useState({ company: "team", cast: false, breakdown: false, props: false, script: false, cues: false });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const sb = supabaseBrowser();
    const { data, error } = src
      ? await sb.rpc("duplicate_production", {
          p_src: src, p_title: f.title, p_company: copy.company, p_cast: copy.cast, p_breakdown: copy.breakdown,
          p_props: copy.props, p_script: copy.script, p_cues: copy.cues,
        })
      : await sb.rpc("create_production", {
          p_title: f.title, p_produced_by: f.produced_by || null, p_directed_by: f.directed_by || null,
          p_venue: f.venue || null, p_show_dates: f.show_dates || null,
        });
    if (!error && src && (f.show_dates || f.venue)) {
      await sb.from("productions").update({ ...(f.show_dates ? { show_dates: f.show_dates } : {}), ...(f.venue ? { venue: f.venue } : {}) }).eq("id", data as string);
    }
    setBusy(false);
    if (error) return setErr(error.message);
    notify.created("Production", f.title);
    onCreated(data as string);
  }

  const box = (k: "cast" | "breakdown" | "props" | "script" | "cues", label: string) => (
    <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={copy[k]} onChange={(e) => setCopy({ ...copy, [k]: e.target.checked })} />{label}</label>
  );

  return (
    <Modal open={open} onClose={onClose} title="New production">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Title"><input className="input" required value={f.title} onChange={set("title")} placeholder="A Portrait of the Artist as Filipino" /></Field>
        <Field label="Start from">
          <select className="input" value={src} onChange={(e) => setSrc(e.target.value)}>
            <option value="">Blank production</option>
            {productions.map((p) => <option key={p.id} value={p.id}>Copy from: {p.title}</option>)}
          </select>
        </Field>
        {src ? (
          <div className="space-y-2 rounded-md bg-paper p-3">
            <Field label="Company to bring over">
              <select className="input" value={copy.company} onChange={(e) => setCopy({ ...copy, company: e.target.value })}>
                <option value="none">Only me</option>
                <option value="team">Production team (SM team, director, PM, designers, crew)</option>
                <option value="all">Everyone, including actors (re-run / remount)</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-1">
              {box("cast", "Characters & casting")}
              {box("breakdown", "Scene breakdown")}
              {box("props", "Props list (reset to Needed)")}
              {box("script", "Current script + blocking")}
              {box("cues", "Cues")}
            </div>
            <p className="text-xs text-ink-mute">Calendar, availability, reports, tasks and line notes always start empty. Producer, director and venues are copied.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Venue"><input className="input" value={f.venue} onChange={set("venue")} placeholder="(keep)" /></Field>
              <Field label="Show dates"><input className="input" value={f.show_dates} onChange={set("show_dates")} /></Field>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Produced by"><input className="input" value={f.produced_by} onChange={set("produced_by")} /></Field>
            <Field label="Directed by"><input className="input" value={f.directed_by} onChange={set("directed_by")} /></Field>
            <Field label="Venue"><input className="input" value={f.venue} onChange={set("venue")} /></Field>
            <Field label="Show dates"><input className="input" value={f.show_dates} onChange={set("show_dates")} placeholder="Nov 25–27, 2026" /></Field>
          </div>
        )}
        <ErrorNote msg={err} />
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create · I'm the Head SM"}</button>
        <p className="text-center text-xs text-ink-mute">Already have paperwork? After creating, use <b>Import files</b> in the production menu.</p>
      </form>
    </Modal>
  );
}
