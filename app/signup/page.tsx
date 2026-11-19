"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { ErrorNote, Field } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const site = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { data, error } = await supabaseBrowser().auth.signUp({
      email, password,
      options: { data: { full_name: name }, emailRedirectTo: `${site}/auth/confirm?next=/dashboard` },
    });
    setBusy(false);
    if (error) return setErr(error.message);
    if (data.session) { router.replace("/dashboard"); router.refresh(); }
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <p className="text-sm text-ink-soft">We sent a confirmation link to <b>{email}</b>. Open it to activate your account.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      footer={<>Already have one? <Link className="font-semibold text-white underline" href="/login">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Full name"><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input className="input" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <p className="text-xs text-ink-mute">If a Head SM already added your email to a production, you will see it as soon as you sign in.</p>
        <ErrorNote msg={err} />
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
    </AuthCard>
  );
}
