"use client";
import { KIND_ICON, findUrls, linkKind, linkLabel } from "@/lib/links";
import { cx } from "@/lib/utils";

/** Clickable chips for every URL found in a piece of text (cells, notes, report sections). */
export function LinkChips({ text, className }: { text?: string | null; className?: string }) {
  const urls = findUrls(text);
  if (!urls.length) return null;
  return (
    <div className={cx("flex flex-wrap gap-1", className)}>
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" title={u} onClick={(e) => e.stopPropagation()}
          className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full border border-cue/30 bg-cue-soft px-2 py-0.5 text-[11px] font-medium text-cue hover:bg-cue hover:text-white">
          <span>{KIND_ICON[linkKind(u)]}</span><span className="truncate">{linkLabel(u)}</span>
        </a>
      ))}
    </div>
  );
}
