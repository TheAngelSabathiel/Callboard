"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Browser client: publishable key + the signed-in user's session. RLS applies. */
export function supabaseBrowser() {
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return client;
}
