"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MOBILE_TABS, PRODUCTION_NAV } from "@/lib/nav";
import { ActivityBell } from "./ActivityBell";
import { QuickCaptureFab } from "@/components/live/QuickCaptureFab";
import { ROLE_LABEL } from "@/lib/roles";
import { cx } from "@/lib/utils";
import { useProduction } from "./ProductionProvider";

export function ProductionShell({ children }: { children: React.ReactNode }) {
  const { production, role } = useProduction();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const base = `/p/${production.id}`;
  const groups = Array.from(new Set(PRODUCTION_NAV.map((n) => n.group)));

  const isPrint = path.includes("/print/");
  if (isPrint) return <>{children}</>;

  const nav = (
    <nav className="flex flex-col gap-4 p-3">
      {groups.map((g) => (
        <div key={g}>
          <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/40">{g}</p>
          {PRODUCTION_NAV.filter((n) => n.group === g).map((n) => {
            const href = base + n.href;
            const active = n.href === "" ? path === base : path.startsWith(href);
            return (
              <Link
                key={n.href}
                href={href}
                onClick={() => setOpen(false)}
                className={cx(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  active ? "bg-white/15 font-semibold text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <span className="w-4 text-center opacity-80">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto bg-ink lg:flex">
        <Header title={production.title} role={role ? ROLE_LABEL[role] : "—"} bell />
        {nav}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-72 overflow-y-auto bg-ink" onClick={(e) => e.stopPropagation()}>
            <Header title={production.title} role={role ? ROLE_LABEL[role] : "—"} />
            {nav}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-paper-line bg-paper/95 px-4 py-2 backdrop-blur lg:hidden">
          <button className="btn btn-sm" onClick={() => setOpen(true)} aria-label="Menu">☰</button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{production.title}</p>
          <ActivityBell />
        </div>
        <main className="mx-auto max-w-7xl p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6">{children}</main>

        {!path.endsWith("/live") && <QuickCaptureFab />}

        {/* Phone bottom tabs */}
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-paper-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {MOBILE_TABS.map((t) => {
            const href = base + t.href;
            const active = path.startsWith(href);
            return (
              <Link key={t.href} href={href} className={cx("flex flex-col items-center py-2 text-[11px]", active ? "font-bold text-cue" : "text-ink-soft")}>
                <span className="text-base leading-none">{t.icon}</span>{t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function Header({ title, role, bell }: { title: string; role: string; bell?: boolean }) {
  return (
    <div className="border-b border-white/10 p-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-[11px] font-semibold uppercase tracking-widest text-cue">
          ← Callboard
        </Link>
        {bell && <ActivityBell dark />}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-white">{title}</p>
      <p className="mt-0.5 text-xs text-white/50">{role}</p>
    </div>
  );
}
