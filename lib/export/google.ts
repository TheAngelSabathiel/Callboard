"use client";
/**
 * Send a generated .docx / .xlsx to Google Drive, converted to a Google Doc / Sheet,
 * so the team can keep editing it in Google. Uses Google Identity Services (token
 * client, scope drive.file: the app only sees files it creates).
 *
 * Setup: NEXT_PUBLIC_GOOGLE_CLIENT_ID (OAuth Web client) + enable the Google Drive API.
 * Add your site to "Authorized JavaScript origins".
 */

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void; callback: (r: TokenResponse) => void };
type GoogleGlobal = { accounts: { oauth2: { initTokenClient: (cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void }) => TokenClient } } };

const SCOPE = "https://www.googleapis.com/auth/drive.file";
let token: { value: string; exp: number } | null = null;
let scriptPromise: Promise<void> | null = null;

export const googleEnabled = () => !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

function loadGis() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google sign-in"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Call from a click handler (opens Google's consent popup the first time). */
export async function getGoogleToken(): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  await loadGis();
  const g = (window as unknown as { google: GoogleGlobal }).google;
  return new Promise((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error || "Google sign-in cancelled"));
        token = { value: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
    });
    client.requestAccessToken({ prompt: token ? "" : "consent" });
  });
}

export async function uploadToGoogle(blob: Blob, name: string, kind: "doc" | "sheet"): Promise<string> {
  const access = await getGoogleToken();
  const meta = {
    name,
    mimeType: kind === "doc" ? "application/vnd.google-apps.document" : "application/vnd.google-apps.spreadsheet",
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
  form.append("file", blob);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}` },
    body: form,
  });
  if (!res.ok) {
    if (res.status === 401) token = null;
    throw new Error(`Google Drive upload failed (${res.status})`);
  }
  const json = (await res.json()) as { id: string; webViewLink?: string };
  return json.webViewLink ?? (kind === "doc" ? `https://docs.google.com/document/d/${json.id}/edit` : `https://docs.google.com/spreadsheets/d/${json.id}/edit`);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
