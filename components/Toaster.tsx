"use client";
import { useEffect, useState } from "react";
import { onToast, type Toast } from "@/lib/notify";
import { cx } from "@/lib/utils";

const ICON: Record<Toast["kind"], string> = { success: "✓", info: "•", error: "!", remote: "↻" };
const TONE: Record<Toast["kind"], string> = {
  success: "border-l-go", info: "border-l-ink-soft", error: "border-l-red-600", remote: "border-l-cue",
};

/** Renders toasts: bottom-center on phones, bottom-right on desktop. */
export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);

  useEffect(() => onToast((t) => {
    setList((cur) => {
      const rest = t.key ? cur.filter((x) => x.key !== t.key) : cur;
      return [...rest, t].slice(-4);
    });
    const ms = t.ms ?? (t.action ? 6000 : 3200);
    setTimeout(() => setList((cur) => cur.filter((x) => x.id !== t.id)), ms);
  }), []);

  const close = (id: string) => setList((cur) => cur.filter((x) => x.id !== id));

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-36 z-[60] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:items-end lg:bottom-24">
      {list.map((t) => (
        <div key={t.id} role="status"
          className={cx("pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-md border border-l-4 border-paper-line bg-white px-3 py-2 text-sm shadow-lg", TONE[t.kind])}>
          <span className={cx("mt-0.5 w-4 text-center font-bold", t.kind === "error" ? "text-red-600" : t.kind === "remote" ? "text-cue" : "text-go")}>{ICON[t.kind]}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{t.title}</p>
            {t.body && <p className="line-clamp-2 text-xs text-ink-mute">{t.body}</p>}
          </div>
          {t.action && (
            <button className="btn btn-sm shrink-0" onClick={async () => { close(t.id); await t.action!.run(); }}>{t.action.label}</button>
          )}
          <button className="shrink-0 text-ink-mute hover:text-ink" onClick={() => close(t.id)} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}
