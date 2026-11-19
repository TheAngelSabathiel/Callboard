"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth/AuthCard";

/**
 * Handles every Supabase email link with the DEFAULT templates (no template edits,
 * no custom SMTP needed):
 *  - invites from the server   → #access_token=…&refresh_token=… (hash)
 *  - sign-up / password reset  → ?code=… (PKCE)
 *  - custom templates, if used → ?token_hash=…&type=…
 */
function Confirm() {
  const router = useRouter();
  const params = useSearchParams();
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    const sb = supabaseBrowser();
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const type = (params.get("type") || hash.get("type")) as EmailOtpType | null;
    const next = params.get("next") || (type === "invite" || type === "recovery" ? "/auth/reset" : "/dashboard");
    const go = () => router.replace(next.startsWith("/") ? next : "/dashboard");
    const fail = (e: string) => setMsg(`This link didn't work: ${e}. Links expire and can only be used once. Ask for a new one, or sign in.`);

    (async () => {
      const err = hash.get("error_description") || params.get("error_description");
      if (err) return fail(err.replace(/\+/g, " "));

      const access = hash.get("access_token"), refresh = hash.get("refresh_token");
      if (access && refresh) {
        const { error } = await sb.auth.setSession({ access_token: access, refresh_token: refresh });
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        return error ? fail(error.message) : go();
      }
      const code = params.get("code");
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        return error ? fail(error.message) : go();
      }
      const tokenHash = params.get("token_hash");
      if (tokenHash && type) {
        const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
        return error ? fail(error.message) : go();
      }
      const { data } = await sb.auth.getSession();
      return data.session ? go() : fail("no sign-in details found");
    })();
  }, [params, router]);

  return (
    <AuthCard title="Callboard">
      <p className="text-sm text-ink-soft">{msg}</p>
      {!msg.endsWith("…") && <a href="/login" className="btn btn-primary mt-4 w-full">Go to sign in</a>}
    </AuthCard>
  );
}

export default function ConfirmPage() {
  return <Suspense><Confirm /></Suspense>;
}
