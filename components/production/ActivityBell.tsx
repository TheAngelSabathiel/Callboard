"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/lib/notify";
import { TABLE_LABEL } from "@/lib/useRows";
import type { Activity } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useProduction } from "./ProductionProvider";

const VERB = { insert: "added", update: "updated", delete: "deleted" } as const;

export function activityHref(base: string, a: Activity) {
  switch (a.table_name) {
    case "tasks": return `${base}/tasks`;
    case "members": case "characters": return `${base}/company`;
    case "events": return a.action === "delete" ? `${base}/calendar` : `${base}/calendar/${a.row_id}`;
    case "event_blocks": return `${base}/calendar`;
    case "availability": return `${base}/availability`;
    case "reports": return a.action === "delete" ? `${base}/reports` : `${base}/reports/${a.row_id}`;
    case "report_sections": case "attendance": return `${base}/reports`;
    case "scripts": case "script_marks": return `${base}/script`;
    case "cues": return `${base}/cues`;
    case "scenes": return `${base}/breakdown`;
    case "props": return `${base}/props`;
    case "line_notes": return `${base}/line-notes`;
    case "links": return `${base}/links`;
    default: return base;
  }
}

export function activityText(a: Activity) {
  const what = (TABLE_LABEL[a.table_name] ?? a.table_name).toLowerCase();
  const n = a.count > 1 && a.action !== "update" ? `${a.count} ${what}s` : `${/^[aeiou]/.test(what) ? "an" : "a"} ${what}`;
  return `${a.actor_name ?? "Someone"} ${VERB[a.action]} ${n}${a.label && a.count <= 1 ? `: ${a.label}` : ""}`;
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Notification bell: team activity feed + live toasts for other people's changes. */
export function ActivityBell({ dark }: { dark?: boolean }) {
  const { production, userId } = useProduction();
  const router = useRouter();
  const base = `/p/${production.id}`;
  const seenKey = `cb-seen-${production.id}`;
  const [items, setItems] = useState<Activity[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string>("");
  const [perm, setPerm] = useState<string>("default");
  const lastToast = useRef(new Map<string, number>());
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    try { setSeen(localStorage.getItem(seenKey) ?? ""); } catch { /* private mode */ }
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, [seenKey]);

  const announce = useCallback((a: Activity) => {
    if (a.user_id === userId) return;
    const now = Date.now();
    const prev = lastToast.current.get(a.id) ?? 0;
    if (now - prev < 60_000 && a.action === "update") return; // one toast per minute for a stream of edits
    lastToast.current.set(a.id, now);
    const href = activityHref(base, a);
    toast({ kind: "remote", title: activityText(a), key: `act-${a.id}`, action: { label: "View", run: () => router.push(href) }, ms: 5000 });
    if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification(production.title, { body: activityText(a), tag: a.id }); } catch { /* ignore */ }
    }
  }, [userId, base, router, production.title]);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.from("activity").select("*").eq("production_id", production.id).order("updated_at", { ascending: false }).limit(60)
      .then(({ data }: { data: Activity[] | null }) => setItems(data ?? []));
    const ch = sb.channel(`activity:${production.id}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity", filter: `production_id=eq.${production.id}` },
        (p: { eventType: string; new: Activity }) => {
          if (p.eventType === "DELETE") return;
          const a = p.new;
          setItems((cur) => [a, ...cur.filter((x) => x.id !== a.id)].slice(0, 60));
          announce(a);
        })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [production.id, announce]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const unread = items.filter((a) => a.user_id !== userId && (!seen || a.updated_at > seen)).length;

  function toggle() {
    const next = !open;
    if (next && ref.current) {
      // Panel is rendered in <body> with fixed position so the sidebar can't clip it
      const r = ref.current.getBoundingClientRect();
      const width = Math.min(384, window.innerWidth - 16);
      const left = Math.min(Math.max(8, dark ? r.right + 8 : r.right - width), window.innerWidth - width - 8);
      setPos({ top: dark ? r.top : r.bottom + 8, left });
    }
    setOpen(next);
    if (next) {
      const now = new Date().toISOString();
      setSeen(now);
      try { localStorage.setItem(seenKey, now); } catch { /* ignore */ }
    }
  }

  return (
    <div ref={ref} className="no-print relative">
      <button onClick={toggle} aria-label="Notifications"
        className={cx("relative flex h-8 w-8 items-center justify-center rounded-md text-base", dark ? "text-white/80 hover:bg-white/10" : "border border-paper-line bg-white hover:bg-paper")}>
        🔔
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-cue px-1 text-center text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} style={{ top: pos.top, left: pos.left, width: Math.min(384, window.innerWidth - 16) }}
          className="card no-print fixed z-[70] max-h-[75vh] overflow-y-auto p-2 shadow-xl">
          <div className="mb-1 flex items-center justify-between px-2">
            <p className="text-sm font-bold text-ink">Team activity</p>
            {perm !== "granted" && typeof Notification !== "undefined" && perm !== "denied" && (
              <button className="text-xs text-cue underline" onClick={async () => setPerm(await Notification.requestPermission())}>Enable desktop alerts</button>
            )}
          </div>
          {items.length === 0 && <p className="px-2 py-4 text-sm text-ink-mute">No activity yet.</p>}
          {items.map((a) => (
            <Link key={a.id} href={activityHref(base, a)} onClick={() => setOpen(false)}
              className={cx("flex gap-2 rounded px-2 py-1.5 text-sm hover:bg-paper", a.user_id !== userId && seen && a.updated_at > seen && "bg-cue-soft")}>
              <span className={cx("mt-0.5 w-4 text-center font-bold", a.action === "delete" ? "text-red-600" : a.action === "insert" ? "text-go" : "text-ink-mute")}>
                {a.action === "insert" ? "+" : a.action === "delete" ? "−" : "✎"}
              </span>
              <span className="min-w-0 flex-1 text-ink">
                <span className="line-clamp-2">{a.user_id === userId ? activityText(a).replace(a.actor_name ?? "", "You") : activityText(a)}</span>
                <span className="block text-[11px] text-ink-mute">{timeAgo(a.updated_at)}</span>
              </span>
            </Link>
          ))}
        </div>
      , document.body)}
    </div>
  );
}
