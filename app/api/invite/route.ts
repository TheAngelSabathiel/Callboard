import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { secretKeyConfigured, supabaseAdmin } from "@/lib/supabase/admin";

/** GET: is email inviting available (secret key configured)? */
export async function GET() {
  return NextResponse.json({ enabled: secretKeyConfigured() });
}

/**
 * POST { memberId }: Head SM sends a Supabase invite email to a company member.
 * Permission is checked as the signed-in user (RLS + is_head) before the secret key is used.
 */
export async function POST(request: Request) {
  if (!secretKeyConfigured()) return NextResponse.json({ error: "Email invites need SUPABASE_SECRET_KEY on the server." }, { status: 501 });
  const { memberId } = (await request.json().catch(() => ({}))) as { memberId?: string };
  if (!memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });

  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: member } = await sb.from("members").select("id, production_id, email, display_name, user_id").eq("id", memberId).single();
  if (!member) return NextResponse.json({ error: "Person not found" }, { status: 404 });
  const { data: head } = await sb.rpc("is_head", { pid: member.production_id });
  if (!head) return NextResponse.json({ error: "Only the Head SM can send invites" }, { status: 403 });
  if (member.user_id) return NextResponse.json({ error: `${member.display_name} already has an account and is linked.` }, { status: 409 });
  if (!member.email) return NextResponse.json({ error: "Add an email first." }, { status: 400 });

  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const admin = supabaseAdmin();
  const { error } = await admin.auth.admin.inviteUserByEmail(member.email, {
    redirectTo: `${site}/auth/confirm?next=/auth/reset`,
    data: { full_name: member.display_name },
  });
  if (error) {
    const msg = /already been registered|already exists/i.test(error.message)
      ? "This email already has an account. Ask them to sign in; they're linked automatically."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
