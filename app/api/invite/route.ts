import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { secretKeyConfigured, supabaseAdmin } from "@/lib/supabase/admin";

/** GET: is email inviting available (secret key configured)? */
export async function GET() {
  return NextResponse.json({ enabled: secretKeyConfigured() });
}

/**
 * POST { memberId, mode }: Head SM invites a company member.
 *   mode "email" → Supabase sends the invite email (needs custom SMTP for non-team addresses)
 *   mode "link"  → returns a one-time invite link to share by chat; no email sent
 * Permission is checked as the signed-in user (RLS + is_head) before the secret key is used.
 */
export async function POST(request: Request) {
  if (!secretKeyConfigured()) return NextResponse.json({ error: "Email invites need SUPABASE_SECRET_KEY on the server." }, { status: 501 });
  const { memberId, mode = "email" } = (await request.json().catch(() => ({}))) as { memberId?: string; mode?: "email" | "link" };
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
  const redirectTo = `${site}/auth/confirm?next=/auth/reset`;
  const admin = supabaseAdmin();
  const already = (m: string) => /already been registered|already exists|already registered/i.test(m);

  if (mode === "link") {
    // No email is sent: the Head SM shares the link (Messenger, Viber, SMS). Works without custom SMTP.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite", email: member.email, options: { redirectTo, data: { full_name: member.display_name } },
    });
    if (error) {
      return NextResponse.json({ error: already(error.message) ? "This email already has an account. Ask them to sign in; they're linked automatically." : error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, link: data.properties?.action_link });
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(member.email, { redirectTo, data: { full_name: member.display_name } });
  if (error) {
    const msg = already(error.message)
      ? "This email already has an account. Ask them to sign in; they're linked automatically."
      : /not authorized/i.test(error.message)
        ? "Supabase's built-in email only sends to your Supabase team. Use “Copy invite link” instead, or set up custom SMTP (README 1.1)."
        : /rate limit/i.test(error.message)
          ? "Email limit reached (built-in email allows very few per hour). Use “Copy invite link”, or set up custom SMTP."
          : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
