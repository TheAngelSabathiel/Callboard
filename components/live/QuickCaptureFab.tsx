"use client";
import { useEffect, useRef, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { Modal } from "@/components/ui";
import { QuickCapture, type QuickCaptureHandle } from "./QuickCapture";

/** Floating "+ Note" button on every production page: log a note, prop, line note or task without leaving the page. */
export function QuickCaptureFab() {
  const { canEdit } = useProduction();
  const [open, setOpen] = useState(false);
  const ref = useRef<QuickCaptureHandle>(null);
  useEffect(() => { if (open) setTimeout(() => ref.current?.focus(), 50); }, [open]);
  if (!canEdit) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} title="Quick note (adds to today's report)"
        className="no-print fixed bottom-20 right-4 z-30 flex h-12 items-center gap-1 rounded-full bg-cue px-4 text-sm font-bold text-white shadow-lg hover:opacity-90 lg:bottom-6 lg:right-6">
        <span className="text-lg leading-none">＋</span> Note
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Quick capture">
        <p className="mb-2 text-xs text-ink-mute">Saved to today&apos;s report, Props Tracker, Line Notes or Tasks. The box stays open so you can keep logging.</p>
        <QuickCapture ref={ref} />
      </Modal>
    </>
  );
}
