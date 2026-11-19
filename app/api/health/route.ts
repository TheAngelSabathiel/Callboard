import { NextResponse } from "next/server";
import { envProblems, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { secretKeyConfigured, supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Deployment check: /api/health. Reports configuration status, never key values. */
export async function GET() {
  const problems = envProblems();
  const secret = process.env.SUPABASE_SECRET_KEY ?? "";
  const checks: Record<string, string> = {
    supabase_url: SUPABASE_URL ? "ok" : "missing",
    publishable_key: !SUPABASE_PUBLISHABLE_KEY ? "missing" : SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") ? "ok" : "wrong format",
    secret_key: !secret ? "not set (optional: email invites + this database check)" : secretKeyConfigured() ? "ok" : "wrong format (must start with sb_secret_)",
    secret_key_exposed: Object.keys(process.env).some((k) => k.startsWith("NEXT_PUBLIC_") && (process.env[k] ?? "").startsWith("sb_secret_")) ? "DANGER: a NEXT_PUBLIC_ variable holds a secret key" : "no",
    google_export: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? "configured" : "off",
  };
  if (secretKeyConfigured()) {
    try {
      const admin = supabaseAdmin();
      const { error } = await admin.from("productions").select("id", { count: "exact", head: true });
      checks.database = error ? `error: ${error.message}` : "ok (schema found)";
      if (!error) {
        const { error: e2 } = await admin.from("activity").select("id", { count: "exact", head: true });
        checks.notifications_table = e2 ? "missing: run 0007_activity.sql" : "ok";
      }
    } catch (e) { checks.database = `error: ${(e as Error).message}`; }
  }
  const ok = problems.length === 0 && checks.secret_key_exposed === "no" && !String(checks.database ?? "ok").startsWith("error");
  return NextResponse.json({ ok, problems, checks }, { status: ok ? 200 : 500 });
}
