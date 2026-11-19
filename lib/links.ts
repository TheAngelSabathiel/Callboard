/** URL helpers: find links in any text, label them, and recognise video/drive links for previews. */
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

export function findUrls(text?: string | null): string[] {
  if (!text) return [];
  return Array.from(new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ""))));
}

export type LinkKind = "youtube" | "vimeo" | "drive" | "docs" | "sheets" | "slides" | "facebook" | "tiktok" | "instagram" | "spotify" | "dropbox" | "canva" | "web";

export function linkKind(url: string): LinkKind {
  const u = url.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return "youtube";
  if (/vimeo\.com/.test(u)) return "vimeo";
  if (/docs\.google\.com\/document/.test(u)) return "docs";
  if (/docs\.google\.com\/spreadsheets/.test(u)) return "sheets";
  if (/docs\.google\.com\/presentation/.test(u)) return "slides";
  if (/drive\.google\.com/.test(u)) return "drive";
  if (/facebook\.com|fb\.watch/.test(u)) return "facebook";
  if (/tiktok\.com/.test(u)) return "tiktok";
  if (/instagram\.com/.test(u)) return "instagram";
  if (/spotify\.com/.test(u)) return "spotify";
  if (/dropbox\.com/.test(u)) return "dropbox";
  if (/canva\.com/.test(u)) return "canva";
  return "web";
}

export const KIND_ICON: Record<LinkKind, string> = {
  youtube: "▶", vimeo: "▶", drive: "▲", docs: "≡", sheets: "▦", slides: "▭", facebook: "f", tiktok: "♪",
  instagram: "◎", spotify: "♫", dropbox: "◆", canva: "✎", web: "↗",
};

export function linkLabel(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const kind = linkKind(url);
    if (kind === "youtube") return "YouTube";
    if (kind === "docs") return "Google Doc";
    if (kind === "sheets") return "Google Sheet";
    if (kind === "slides") return "Google Slides";
    if (kind === "drive") return "Google Drive";
    return host;
  } catch { return url.slice(0, 30); }
}

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** Embeddable player URL for in-app preview, if the service allows it. */
export function embedUrl(url: string): string | null {
  const yt = youtubeId(url);
  if (yt) {
    const t = url.match(/[?&]t=(\d+)/)?.[1];
    return `https://www.youtube.com/embed/${yt}${t ? `?start=${t}` : ""}`;
  }
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  const gd = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (gd) return `https://drive.google.com/file/d/${gd[1]}/preview`;
  return null;
}

export function thumbnail(url: string): string | null {
  const yt = youtubeId(url);
  return yt ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg` : null;
}

export function normalizeUrl(s: string) {
  const t = s.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
