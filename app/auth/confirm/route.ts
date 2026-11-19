import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Email link handler (Supabase SSR pattern): invite, sign-up confirmation, password recovery.
 * Email templates link to {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<path>
 * Also accepts ?code= (PKCE) so default templates keep working.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || (type === "invite" || type === "recovery" ? "/auth/reset" : "/dashboard");
  const sb = await supabaseServer();
  let error: string | null = null;
  if (tokenHash && type) {
    const res = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    error = res.error?.message ?? null;
  } else if (code) {
    const res = await sb.auth.exchangeCodeForSession(code);
    error = res.error?.message ?? null;
  } else error = "Link is incomplete.";
  if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, url.origin));
  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/dashboard", url.origin));
}
