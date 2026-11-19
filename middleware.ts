import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, envProblems } from "@/lib/supabase/env";

const PUBLIC = ["/", "/api/health", "/login", "/signup", "/auth", "/forgot"];

export async function middleware(request: NextRequest) {
  const problems = envProblems();
  if (problems.length) {
    // Clear message instead of a crash when deployment env vars are missing or wrong
    return new NextResponse(`Callboard is not configured yet:\n\n- ${problems.join("\n- ")}\n\nSet these in Vercel → Project → Settings → Environment Variables, then redeploy.`, {
      status: 500, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || (p !== "/" && path.startsWith(p + "/")) || path === p);
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
