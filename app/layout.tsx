import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/Toaster";

export const metadata: Metadata = {
  title: "Callboard · Stage Management",
  description: "Stage management workspace: calendar, availability, SM reports, script, blocking and cues.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#16181d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}<Toaster /></body>
    </html>
  );
}
