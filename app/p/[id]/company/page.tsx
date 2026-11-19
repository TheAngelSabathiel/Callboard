"use client";
import { useEffect, useMemo, useState } from "react";
import { notify } from "@/lib/notify";
import { useProduction } from "@/components/production/ProductionProvider";
import { ConfirmButton, ErrorNote, Field, InlineInput, Modal, PageHeader, Tabs } from "@/components/ui";
import { DEPARTMENTS, ROLE_LABEL, ROLE_ORDER } from "@/lib/roles";
import type { Member, MemberRole } from "@/lib/types";
import { cx } from "@/lib/utils";
import { ExportMenu } from "@/components/export/ExportMenu";

export default function CompanyPage() {
  const [tab, setTab] = useState<"directory" | "cast">("directory");
  const { production } = useProduction();
  return (
    <>
      <PageHeader help="company"
        title="Company & Cast"
        subtitle="Directory of everyone on the production, their app access, and the character list."
        actions={
          <>
            <Tabs value={tab} onChange={setTab} items={[{ value: "directory", label: "Directory" }, { value: "cast", label: "Cast" }]} />
            <ExportMenu kind="directory" productionId={production.id} />
          </>
        }
      />
      {tab === "directory" ? <Directory /> : <Cast />}
    </>
  );
}

function InviteButton({ m }: { m: Member }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [link, setLink] = useState<string | null>(null);
  if (m.user_id || !m.email) return null;

  async function call(mode: "email" | "link") {
    setState("busy");
    const res = await fetch("/api/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId: m.id, mode }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; link?: string };
    if (!res.ok) { notify.error(j.error ?? "Invite failed"); setState("idle"); return; }
    if (mode === "link" && j.link) {
      setLink(j.link);
      try { await navigator.clipboard.writeText(j.link); notify.info("Invite link copied", `Send it to ${m.display_name} by chat. It works once.`); }
      catch { notify.info("Invite link ready", "Copy it from the box."); }
      setState("idle");
      return;
    }
    notify.info("Invite email sent", m.email ?? "");
    setState("sent");
  }

  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap gap-1">
        <button className="btn btn-sm" disabled={state === "busy"} title="One-time sign-in link to send by Messenger / Viber / SMS. No email needed." onClick={() => call("link")}>🔗 Copy invite link</button>
        <button className="btn btn-sm" disabled={state !== "idle"} title="Supabase emails the invite (needs custom SMTP for people outside your Supabase team)" onClick={() => call("email")}>{state === "sent" ? "Emailed ✓" : "✉ Email"}</button>
      </div>
      {link && <input readOnly className="input py-0.5 text-[10px]" value={link} onFocus={(e) => e.target.select()} />}
    </div>
  );
}

function AccessBadge({ m }: { m: Member }) {
  if (m.user_id) return <span className="chip bg-green-50 text-go">Linked</span>;
  if (m.email) return <span className="chip bg-amber-50 text-stby">Invite pending</span>;
  return <span className="chip bg-paper text-ink-mute">Contact only</span>;
}

function Directory() {
  const { members, isHead, me } = useProduction();
  const [open, setOpen] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [q, setQ] = useState("");
  const list = members.rows.filter((m) =>
    !q || [m.display_name, m.position, m.department, m.email].join(" ").toLowerCase().includes(q.toLowerCase())
  );
  const groups = useMemo(() => {
    const g = new Map<string, Member[]>();
    list.forEach((m) => {
      const k = m.department || "Unassigned";
      g.set(k, [...(g.get(k) ?? []), m]);
    });
    return Array.from(g.entries()).sort(([a], [b]) => {
      const ia = DEPARTMENTS.indexOf(a), ib = DEPARTMENTS.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [list]);

  const signupLink = typeof window !== "undefined" ? `${window.location.origin}/signup` : "/signup";
  const [inviteEnabled, setInviteEnabled] = useState(false);
  useEffect(() => {
    if (!isHead) return;
    fetch("/api/invite").then((r) => r.json()).then((j: { enabled?: boolean }) => setInviteEnabled(!!j.enabled)).catch(() => {});
  }, [isHead]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search name, position, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        {isHead && (
          <>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Add person</button>
            <button className="btn" onClick={() => setBulk(true)}>Paste from sheet</button>
          </>
        )}
      </div>
      {isHead && (
        <p className="text-xs text-ink-mute">
          Add people by email. {inviteEnabled ? "Use 🔗 Copy invite link (send it by chat) or ✉ Email, or send" : "Send"} them <code className="rounded bg-white px-1">{signupLink}</code>; signing up with that same email links them automatically.
        </p>
      )}
      <ErrorNote msg={members.error} />

      {groups.map(([dept, rows]) => (
        <div key={dept} className="card overflow-x-auto">
          <p className="border-b border-paper-line px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-mute">{dept}</p>
          <table className="table-sm min-w-[760px]">
            <thead>
              <tr><th className="w-48">Position</th><th>Name</th><th className="w-44">App access</th><th>Email</th><th className="w-36">Phone</th><th className="w-28" /></tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className={cx(m.id === me?.id && "bg-cue-soft/40")}>
                  <td>{isHead ? <InlineInput value={m.position} onSave={(v) => members.update(m.id, { position: v })} /> : m.position}</td>
                  <td className="font-medium">{isHead ? <InlineInput value={m.display_name} onSave={(v) => v && members.update(m.id, { display_name: v })} /> : m.display_name}</td>
                  <td>
                    {isHead && m.id !== me?.id ? (
                      <select className="input" value={m.role} onChange={(e) => members.update(m.id, { role: e.target.value as MemberRole })}>
                        {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    ) : <span className="text-sm">{ROLE_LABEL[m.role]}</span>}
                    <div className="mt-1"><AccessBadge m={m} /></div>
                    {isHead && inviteEnabled && <InviteButton m={m} />}
                  </td>
                  <td>{isHead ? <InlineInput value={m.email} type="email" onSave={(v) => members.update(m.id, { email: v || null })} /> : m.email}</td>
                  <td>{isHead ? <InlineInput value={m.phone} onSave={(v) => members.update(m.id, { phone: v || null })} /> : m.phone}</td>
                  <td className="text-right">
                    {isHead && (
                      <div className="flex flex-col items-end gap-1">
                        <select className="input py-1 text-xs" value={m.department ?? ""} onChange={(e) => members.update(m.id, { department: e.target.value || null })}>
                          <option value="">Dept…</option>
                          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                        </select>
                        {m.id !== me?.id && <ConfirmButton onConfirm={() => members.remove(m.id)}>Remove</ConfirmButton>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <AddMember open={open} onClose={() => setOpen(false)} />
      <BulkMembers open={bulk} onClose={() => setBulk(false)} />
    </div>
  );
}

function AddMember({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { production, members } = useProduction();
  const empty = { display_name: "", position: "", department: "Cast", role: "actor" as MemberRole, email: "", phone: "" };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await members.insert({
        production_id: production.id, display_name: f.display_name, position: f.position || null,
        department: f.department || null, role: f.role, email: f.email || null, phone: f.phone || null,
        sort_order: members.rows.length,
      });
      setF(empty); onClose();
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add person">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name"><input className="input" required value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Position"><input className="input" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} placeholder="Lights Designer" /></Field>
          <Field label="Department">
            <select className="input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="App access">
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as MemberRole })}>
              {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        <Field label="Email (used to link their account)"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <p className="text-xs text-ink-mute">Head SM, SM and ASM can edit schedules, reports, script and cues. Others get read access.</p>
        <ErrorNote msg={err} />
        <button className="btn btn-primary w-full">Add</button>
      </form>
    </Modal>
  );
}

function BulkMembers({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { production, members } = useProduction();
  const [text, setText] = useState("");
  const [dept, setDept] = useState("Cast");
  const [role, setRole] = useState<MemberRole>("actor");
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    const rows = text.split(/\r?\n/).map((l) => l.split("\t").map((c) => c.trim())).filter((c) => c.some(Boolean));
    try {
      await members.insertMany(rows.map((c, i) => ({
        production_id: production.id,
        position: c[0] || null,
        display_name: c[1] || c[0] || "Unnamed",
        email: c[2] || null,
        phone: c[3] || null,
        department: dept,
        role,
        sort_order: members.rows.length + i,
      })));
      setText(""); onClose();
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Paste from spreadsheet" wide>
      <p className="mb-2 text-sm text-ink-mute">Copy rows from Excel / Google Sheets with columns: <b>Position · Name · Email · Phone</b>.</p>
      <textarea className="input h-48 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Candido Marasigan\tJoel Lamangan\t\t"} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Department"><select className="input" value={dept} onChange={(e) => setDept(e.target.value)}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="App access"><select className="input" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>{ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
      </div>
      <ErrorNote msg={err} />
      <button className="btn btn-primary mt-3 w-full" onClick={submit}>Import</button>
    </Modal>
  );
}

function Cast() {
  const { production, characters, membersAZ, canEdit } = useProduction();
  const [names, setNames] = useState("");
  const actors = membersAZ;
  async function addMany() {
    const list = names.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    await characters.insertMany(list.map((name, i) => ({ production_id: production.id, name, sort_order: characters.rows.length + i })));
    setNames("");
  }
  const sel = (value: string | null, onChange: (v: string | null) => void) => (
    <select className="input" disabled={!canEdit} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">—</option>
      {actors.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
    </select>
  );
  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto">
        <table className="table-sm min-w-[680px]">
          <thead><tr><th className="w-10">#</th><th>Character</th><th>Actor</th><th>Alternate</th><th>Notes</th><th className="w-20" /></tr></thead>
          <tbody>
            {characters.rows.map((c, i) => (
              <tr key={c.id}>
                <td className="text-ink-mute">{i + 1}</td>
                <td className="font-medium">{canEdit ? <InlineInput value={c.name} onSave={(v) => v && characters.update(c.id, { name: v })} /> : c.name}</td>
                <td>{sel(c.actor_id, (v) => characters.update(c.id, { actor_id: v }))}</td>
                <td>{sel(c.alternate_id, (v) => characters.update(c.id, { alternate_id: v }))}</td>
                <td>{canEdit ? <InlineInput value={c.description} onSave={(v) => characters.update(c.id, { description: v || null })} /> : c.description}</td>
                <td className="text-right">{canEdit && <ConfirmButton onConfirm={() => characters.remove(c.id)}>Delete</ConfirmButton>}</td>
              </tr>
            ))}
            {characters.rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-ink-mute">No characters yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="card p-4">
          <Field label="Add characters (one per line)">
            <textarea className="input h-28" value={names} onChange={(e) => setNames(e.target.value)} placeholder={"Candido Marasigan\nPablito Marasigan\nBitoy Camacho"} />
          </Field>
          <button className="btn btn-primary mt-2" onClick={addMany} disabled={!names.trim()}>Add characters</button>
          <p className="mt-2 text-xs text-ink-mute">Add the actors in the Directory first (department “Cast”), then pick them here.</p>
        </div>
      )}
    </div>
  );
}
