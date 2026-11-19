"use client";
/**
 * Tiny toast bus usable from anywhere (hooks, helpers, components).
 * <Toaster /> in the root layout renders them.
 */
export type ToastKind = "success" | "info" | "error" | "remote";
export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  /** same key replaces the previous toast (e.g. repeated "Saved") */
  key?: string;
  action?: { label: string; run: () => void | Promise<void> };
  ms?: number;
};

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();

export function onToast(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function toast(t: Omit<Toast, "id"> & { id?: string }) {
  const full: Toast = { id: t.id ?? Math.random().toString(36).slice(2), ...t };
  listeners.forEach((l) => l(full));
  return full.id;
}

export const notify = {
  created: (what: string, name?: string | null, undo?: () => void | Promise<void>) =>
    toast({ kind: "success", title: `${what} added`, body: name || undefined, action: undo ? { label: "Undo", run: undo } : undefined }),
  saved: (what = "Changes") => toast({ kind: "success", title: `${what} saved`, key: "saved", ms: 1600 }),
  deleted: (what: string, name?: string | null, undo?: () => void | Promise<void>) =>
    toast({ kind: "info", title: `${what} deleted`, body: name || undefined, action: undo ? { label: "Undo", run: undo } : undefined, ms: 6000 }),
  error: (msg: string) => toast({ kind: "error", title: "Couldn't save", body: msg, ms: 7000 }),
  info: (title: string, body?: string) => toast({ kind: "info", title, body }),
};
