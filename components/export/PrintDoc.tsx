import type { Block, DocModel } from "@/lib/export/model";

/** HTML rendering of a DocModel tuned for paper (A4). Use the browser's Print → Save as PDF. */
export function PrintDoc({ doc }: { doc: DocModel }) {
  const landscape = doc.orientation === "landscape";
  return (
    <div className="print-doc mx-auto bg-white p-6 text-[11px] leading-snug text-black shadow-sm print:p-0 print:shadow-none" style={{ maxWidth: landscape ? 1120 : 800 }}>
      <style>{`
        @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm; }
        .print-doc table { border-collapse: collapse; width: 100%; }
        .print-doc th, .print-doc td { border: 1px solid #999; padding: 3px 5px; vertical-align: top; }
        .print-doc thead { display: table-header-group; }
        .print-doc tr { break-inside: avoid; }
        .print-doc th { background: #16181d; color: #fff; font-weight: 700; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-doc td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-doc .sec { break-inside: avoid; }
      `}</style>
      <header className="mb-3 text-center">
        {doc.header.map((h, i) => <p key={i} className={i === 0 ? "text-base font-bold tracking-wide" : "text-[11px]"}>{h}</p>)}
        <p className="mt-2 text-sm font-bold tracking-wider text-[#c2410c]">{doc.title}</p>
        {doc.subtitle && <p className="text-[10px] italic">{doc.subtitle}</p>}
      </header>
      {doc.blocks.map((b, i) => <PrintBlock key={i} b={b} />)}
    </div>
  );
}

function PrintBlock({ b }: { b: Block }) {
  switch (b.type) {
    case "heading": return <h2 className="mb-1 mt-3 text-sm font-bold">{b.text}</h2>;
    case "pagebreak": return <div style={{ breakAfter: "page" }} />;
    case "text":
      return (
        <div className="sec mb-2">
          {b.title && <p className={`font-bold ${b.flag ? "text-[#c2410c]" : ""}`}>{b.title}</p>}
          <p className="whitespace-pre-wrap">{b.body}</p>
        </div>
      );
    case "signature":
      return (
        <div className="mt-10 grid gap-8" style={{ gridTemplateColumns: `repeat(${b.labels.length}, 1fr)` }}>
          {b.labels.map((l) => <div key={l}><div className="h-8 border-b border-black" /><p className="mt-1">{l}</p></div>)}
        </div>
      );
    case "kv": {
      const per = (b.columns ?? 2) / 2;
      const rows: [string, string][][] = [];
      for (let i = 0; i < b.rows.length; i += per) rows.push(b.rows.slice(i, i + per));
      return (
        <table className="mb-3">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map(([k, v], j) => [
                  <td key={`k${j}`} className="w-[13%] bg-[#f1ede4] font-bold">{k}</td>,
                  <td key={`v${j}`} className="whitespace-pre-wrap">{v}</td>,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case "table": {
      const total = b.columns.reduce((s, c) => s + (c.width ?? 1), 0);
      const groups = new Set(b.groupRows ?? []);
      return (
        <div className="mb-3">
          {b.title && <p className="mb-1 font-bold">{b.title}</p>}
          <table style={{ fontSize: b.fontSize ? `${b.fontSize}pt` : undefined }}>
            <colgroup>{b.columns.map((c, i) => <col key={i} style={{ width: `${((c.width ?? 1) / total) * 100}%` }} />)}</colgroup>
            <thead><tr>{b.columns.map((c, i) => <th key={i} className="whitespace-pre-line">{c.label}</th>)}</tr></thead>
            <tbody>
              {b.rows.map((r, ri) => groups.has(ri) ? (
                <tr key={ri}><td colSpan={b.columns.length} className="bg-[#e6e1d7] font-bold">{r[0]}</td></tr>
              ) : (
                <tr key={ri}>
                  {b.columns.map((_, ci) => {
                    const fill = b.fills?.[ri]?.[ci];
                    return (
                      <td key={ci} className="whitespace-pre-wrap" style={{ background: fill ? `#${fill.slice(0, 6)}` : undefined, fontFamily: b.monoCol === ci ? "'Courier Prime','Courier New',monospace" : undefined, textAlign: b.columns.length > 12 && ci > 1 ? "center" : undefined }}>
                        {r[ci]}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
}
