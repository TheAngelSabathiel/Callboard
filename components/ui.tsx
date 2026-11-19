"use client";
import { useEffect, useState } from "react";
import { cx } from "@/lib/utils";
import { HELP } from "@/lib/help";

export function HelpButton({ topic, className }: { topic: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const h = HELP[topic];
  if (!h) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Help: ${h.title}`} title="Help"
        className={cx("no-print inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-paper-line bg-white text-xs font-bold text-ink-soft hover:border-cue hover:text-cue", className)}>?</button>
      <Modal open={open} onClose={() => setOpen(false)} title={h.title}>
        <p className="text-sm text-ink-soft">{h.intro}</p>
        <ul className="mt-3 space-y-2 text-sm">
          {h.tips.map((t) => <li key={t} className="flex gap-2"><span className="text-cue">▸</span><span>{t}</span></li>)}
        </ul>
        {h.shortcuts && (
          <div className="mt-4 rounded-md bg-paper p-3">
            <p className="label">Shortcuts</p>
            <table className="w-full text-sm">
              <tbody>{h.shortcuts.map(([k, v]) => <tr key={k}><td className="w-32 py-0.5"><kbd className="rounded border border-paper-line bg-white px-1.5 py-0.5 font-mono text-xs">{k}</kbd></td><td>{v}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-ink-mute">Full guide: README → User guide.</p>
      </Modal>
    </>
  );
}

export function PageHeader({ title, subtitle, actions, help }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; help?: string }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><h1 className="h-page">{title}</h1>{help && <HelpButton topic={help} />}</div>
        {subtitle && <p className="mt-1 text-sm text-ink-mute">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={cx("card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-4 sm:rounded-lg sm:p-5", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-ink-mute">{children}</div>}
    </div>
  );
}

export function ErrorNote({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  return <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>;
}

export function ConfirmButton({ onConfirm, children, className, label = "Confirm?" }: {
  onConfirm: () => void; children: React.ReactNode; className?: string; label?: string;
}) {
  const [arm, setArm] = useState(false);
  useEffect(() => {
    if (!arm) return;
    const t = setTimeout(() => setArm(false), 3000);
    return () => clearTimeout(t);
  }, [arm]);
  return (
    <button
      type="button"
      className={cx("btn btn-sm", arm ? "btn-danger" : "btn-ghost", className)}
      onClick={() => (arm ? (setArm(false), onConfirm()) : setArm(true))}
    >
      {arm ? label : children}
    </button>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void; items: { value: T; label: string }[];
}) {
  return (
    <div className="no-print inline-flex rounded-md border border-paper-line bg-white p-0.5">
      {items.map((i) => (
        <button
          key={i.value}
          className={cx("rounded px-3 py-1 text-sm font-medium", value === i.value ? "bg-ink text-white" : "text-ink-soft hover:bg-paper")}
          onClick={() => onChange(i.value)}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

/** Text input that saves on blur / Enter instead of every keystroke. */
export function InlineInput({ value, onSave, className, placeholder, type = "text", disabled }: {
  value: string | null | undefined; onSave: (v: string) => void; className?: string;
  placeholder?: string; type?: string; disabled?: boolean;
}) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <input
      className={cx("input", className)}
      value={v}
      type={type}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (value ?? "") && onSave(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function InlineTextarea({ value, onSave, className, placeholder, rows = 3, disabled }: {
  value: string | null | undefined; onSave: (v: string) => void; className?: string;
  placeholder?: string; rows?: number; disabled?: boolean;
}) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <textarea
      className={cx("input", className)}
      value={v}
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (value ?? "") && onSave(v)}
    />
  );
}
