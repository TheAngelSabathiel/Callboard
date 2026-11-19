"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { ErrorNote, Field } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(params.get("error"));
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setErr(error.message);
    router.replace(params.get("next") || "/dashboard");
    router.refresh();
  }

  return (
    <AuthCard
      title="Sign in"
      footer={<>No account? <Link className="font-semibold text-white underline" href="/signup">Create one</Link></>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorNote msg={err} />
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <Link href="/forgot" className="block text-center text-xs text-ink-mute underline">Forgot password?</Link>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
