"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProduction } from "@/components/production/ProductionProvider";
import { PrintDoc } from "@/components/export/PrintDoc";
import { ExportMenu } from "@/components/export/ExportMenu";
import { type ExportKind, buildDoc } from "@/lib/export/loaders";
import type { DocModel } from "@/lib/export/model";

export default function PrintPage({ params }: { params: Promise<{ id: string; kind: string }> }) {
  const { kind } = use(params);
  const search = useSearchParams();
  const { production, members, characters } = useProduction();
  const [doc, setDoc] = useState<DocModel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const qp = Object.fromEntries(search.entries());
  const key = search.toString();

  useEffect(() => {
    if (members.loading || characters.loading) return;
    buildDoc(kind as ExportKind, { production, members: members.rows, characters: characters.rows }, Object.fromEntries(new URLSearchParams(key).entries()))
      .then(setDoc).catch((e: Error) => setErr(e.message));
  }, [kind, key, production, members.rows, members.loading, characters.rows, characters.loading]);

  return (
    <div className="min-h-screen bg-[#e9e6df] py-4 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4">
        <Link href={`/p/${production.id}`} className="text-sm text-ink-mute">← {production.title}</Link>
        <div className="flex gap-2">
          <ExportMenu kind={kind} params={qp} label="Download" />
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!doc}>Print / Save PDF</button>
        </div>
      </div>
      {err && <p className="mx-auto max-w-xl rounded bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      {doc ? <PrintDoc doc={doc} /> : !err && <p className="text-center text-sm text-ink-mute">Preparing document…</p>}
    </div>
  );
}
