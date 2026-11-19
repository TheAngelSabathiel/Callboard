"use client";
import { notify } from "@/lib/notify";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ErrorNote, Field } from "@/components/ui";

export default function AccountPage() {
  const [id, setId] = useState<string | null>(null);
  const [f, setF] = useState({ full_name: "", phone: "", email: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      setId(u.user.id);
      const { data } = await sb.from("profiles").select("*").eq("id", u.user.id).single();
      setF({ full_name: data?.full_name ?? "", phone: data?.phone ?? "", email: u.user.email ?? "" });
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    const { error } = await supabaseBrowser().from("profiles").update({ full_name: f.full_name, phone: f.phone }).eq("id", id);
    if (error) setErr(error.message); else { setMsg("Saved."); notify.saved("Profile"); }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <Link href="/dashboard" className="text-sm text-ink-mute">← Dashboard</Link>
      <h1 className="h-page mt-2">Account</h1>
      <form onSubmit={save} className="card mt-4 space-y-3 p-5">
        <Field label="Email"><input className="input" disabled value={f.email} /></Field>
        <Field label="Full name"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <ErrorNote msg={err} />
        {msg && <p className="text-sm text-go">{msg}</p>}
        <button className="btn btn-primary">Save</button>
      </form>
    </div>
  );
}
