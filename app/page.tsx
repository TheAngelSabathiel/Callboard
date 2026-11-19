import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const FEATURES = [
  ["Calendar & agenda", "Rehearsal blocks with who is called, per day."],
  ["Availability checker", "A / UN / TBD grid with conflict warnings."],
  ["SM reports", "Per-date reports the whole SM team edits live."],
  ["Script & blocking", "Navigate by act, scene, page. Mark blocking and notes."],
  ["Cue breakdown", "LX, SQ, VQ, FLY cues anchored to lines."],
  ["Print & export", "Word, Excel, Google Docs/Sheets, printable paperwork."],
];

export default async function Home() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (data.user) redirect("/dashboard");
  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-cue">Callboard</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">The stage manager&apos;s book, online.</h1>
        <p className="mt-4 max-w-xl text-white/70">
          Calendars, availability, reports, script, blocking and cues for every production. Built for the rehearsal room and the booth.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/signup" className="btn btn-cue">Create account</Link>
          <Link href="/login" className="btn border-white/20 bg-transparent text-white hover:bg-white/10">Sign in</Link>
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, d]) => (
            <div key={t} className="rounded-lg border border-white/10 p-4">
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-white/60">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
