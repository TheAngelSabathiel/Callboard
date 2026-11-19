"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { ErrorNote, Field } from "@/components/ui";

export default function ResetPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    if (error) setErr(error.message); else router.replace("/dashboard");
  }
  return (
    <AuthCard title="Set a new password">
      <form onSubmit={submit} className="space-y-3">
        <Field label="New password"><input className="input" type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <ErrorNote msg={err} />
        <button className="btn btn-primary w-full">Save password</button>
      </form>
    </AuthCard>
  );
}
