import Link from "next/link";

export function AuthCard({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center text-sm font-bold uppercase tracking-[0.3em] text-cue">Callboard</Link>
        <div className="card p-6">
          <h1 className="mb-4 text-lg font-bold">{title}</h1>
          {children}
        </div>
        {footer && <div className="mt-4 text-center text-sm text-white/70">{footer}</div>}
      </div>
    </div>
  );
}
