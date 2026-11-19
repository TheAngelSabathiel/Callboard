/**
 * Supabase connection settings (new API keys).
 *  - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  sb_publishable_…  browser + server, respects RLS
 *  - SUPABASE_SECRET_KEY                   sb_secret_…       server only (lib/supabase/admin.ts)
 * Legacy anon / service_role keys are not used.
 * NEXT_PUBLIC_ values must be read literally so Next.js can inline them at build time.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function envProblems(): string[] {
  const out: string[] = [];
  if (!SUPABASE_URL) out.push("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!SUPABASE_PUBLISHABLE_KEY) out.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (Supabase → Project Settings → API Keys → Publishable key).");
  else if (!SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")) {
    out.push(SUPABASE_PUBLISHABLE_KEY.startsWith("sb_secret_")
      ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a SECRET key. Replace it with the publishable key and rotate that secret key now."
      : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY should start with sb_publishable_ (legacy anon keys are being retired).");
  }
  return out;
}
