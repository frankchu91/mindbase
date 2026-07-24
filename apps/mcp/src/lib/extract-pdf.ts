// apps/mcp/src/lib/extract-pdf.ts
//
// Local PDF text extraction via pdfjs-dist (no API roundtrip). Dynamic
// import keeps startup fast — pdfjs only loads when a PDF is ingested.
// Same pattern as apps/server/src/routes/ingest.ts.

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .join(' ');
    parts.push(pageText);
  }
  return parts.join('\n\n').trim();
}
