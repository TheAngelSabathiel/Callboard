"use client";
import { notify } from "@/lib/notify";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProduction } from "@/components/production/ProductionProvider";
import { ConfirmButton, ErrorNote, Field, PageHeader } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Production } from "@/lib/types";

const FIELDS: { key: keyof Production; label: string; type?: string; placeholder?: string }[] = [
  { key: "title", label: "Title" },
  { key: "subtitle", label: "Subtitle / Company line", placeholder: "World Theater Project" },
  { key: "produced_by", label: "Produced by" },
  { key: "directed_by", label: "Directed by" },
  { key: "venue", label: "Performance venue" },
  { key: "rehearsal_venue", label: "Rehearsal venue" },
  { key: "show_dates", label: "Show dates (display)", placeholder: "November 25, 26, 27, 2026 & January 2027" },
  { key: "script_version", label: "Script version", placeholder: "On-going edit of Abridged Version" },
  { key: "first_rehearsal", label: "First rehearsal", type: "date" },
  { key: "opening_date", label: "Opening", type: "date" },
  { key: "closing_date", label: "Closing", type: "date" },
  { key: "accent_color", label: "Accent color", type: "color" },
];

export default function SettingsPage() {
  const { production, setProduction, isHead, me } = useProduction();
  const router = useRouter();
  const [f, setF] = useState<Production>(production);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setSaved(false);
    const patch: Partial<Production> = {};
    FIELDS.forEach(({ key }) => {
      const v = f[key];
      (patch as Record<string, unknown>)[key] = v === "" ? null : v;
    });
    const { data, error } = await supabaseBrowser().from("productions").update(patch).eq("id", production.id).select("*").single();
    if (error) return setErr(error.message);
    setProduction(data as Production); setSaved(true); notify.saved("Production details");
  }

  async function archive(v: boolean) {
    const { data } = await supabaseBrowser().from("productions").update({ archived: v }).eq("id", production.id).select("*").single();
    if (data) { setProduction(data as Production); setF(data as Production); notify.info(v ? "Production archived" : "Production restored"); }
  }

  async function destroy() {
    const { error } = await supabaseBrowser().from("productions").delete().eq("id", production.id);
    if (error) setErr(error.message); else router.replace("/dashboard");
  }

  return (
    <>
      <PageHeader help="settings" title="Settings" subtitle="Production details print on every report header." />
      {!isHead && <p className="mb-4 text-sm text-ink-mute">Only the Head SM can change these.</p>}
      <form onSubmit={save} className="card grid gap-3 p-5 sm:grid-cols-2">
        {FIELDS.map(({ key, label, type, placeholder }) => (
          <Field key={key} label={label} className={key === "title" || key === "show_dates" ? "sm:col-span-2" : ""}>
            <input
              className="input"
              type={type ?? "text"}
              disabled={!isHead}
              placeholder={placeholder}
              value={(f[key] as string | null) ?? (type === "color" ? "#c2410c" : "")}
              onChange={(e) => setF({ ...f, [key]: e.target.value })}
            />
          </Field>
        ))}
        <div className="sm:col-span-2">
          <ErrorNote msg={err} />
          {saved && <p className="text-sm text-go">Saved.</p>}
          {isHead && <button className="btn btn-primary mt-2">Save details</button>}
        </div>
      </form>

      {!isHead && me && (
        <div className="card mt-6 space-y-3 p-5">
          <p className="font-semibold">Leave production</p>
          <p className="text-sm text-ink-mute">Removes you from this production. The Head SM can add you back.</p>
          <ConfirmButton onConfirm={async () => {
            const { error } = await supabaseBrowser().from("members").delete().eq("id", me.id);
            if (error) setErr(error.message); else router.replace("/dashboard");
          }} label="Leave for real?">Leave production</ConfirmButton>
        </div>
      )}

      {isHead && (
        <div className="card mt-6 space-y-3 p-5">
          <p className="font-semibold">Danger zone</p>
          <p className="text-sm text-ink-mute">Archive hides a finished show from the dashboard but keeps everything. To start a new show from this one, use <b>New production → Copy from</b> on the dashboard.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => archive(!production.archived)}>{production.archived ? "Unarchive" : "Archive production"}</button>
            <ConfirmButton onConfirm={destroy} label="Delete everything?">Delete production</ConfirmButton>
          </div>
        </div>
      )}
    </>
  );
}
