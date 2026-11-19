import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/**
 * Admin client with the SECRET key (sb_secret_…). Bypasses RLS.
 * Server-only: importing this from a client component fails the build.
 * Always check the caller's permission yourself before using it.
 */
export function secretKeyConfigured() {
  const k = process.env.SUPABASE_SECRET_KEY ?? "";
  return k.startsWith("sb_secret_");
}

export function supabaseAdmin() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  if (!key.startsWith("sb_secret_")) throw new Error("SUPABASE_SECRET_KEY must be a secret key (sb_secret_…), not a legacy service_role key");
  return createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
