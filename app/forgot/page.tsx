"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { ErrorNote, Field } from "@/components/ui";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const site = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${site}/auth/confirm?next=/auth/reset`,
    });
    if (error) setErr(error.message); else setSent(true);
  }
  return (
    <AuthCard title="Reset password">
      {sent ? <p className="text-sm">Reset link sent to <b>{email}</b>.</p> : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <ErrorNote msg={err} />
          <button className="btn btn-primary w-full">Send reset link</button>
        </form>
      )}
    </AuthCard>
  );
}
