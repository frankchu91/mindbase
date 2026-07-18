import type { Store } from '../storage/store';
import type { RawDoc, RawMetaJson } from '../types';
import { newShortId } from '../storage/ids';
import { rawMetaPath, rawPath, todayDir } from '../storage/paths';

export interface IngestFileOptions {
  pdfExtract?: (file: File) => Promise<string>;
}

async function readAsText(file: File): Promise<string> {
  // Works in both Node and browser
  return file.text();
}

function kindForFile(
  file: File,
): 'upload-md' | 'upload-txt' | 'upload-pdf' | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.md') || file.type === 'text/markdown') return 'upload-md';
  if (name.endsWith('.txt') || file.type === 'text/plain') return 'upload-txt';
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'upload-pdf';
  return null;
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export async function ingestFile(
  store: Store,
  file: File,
  opts: IngestFileOptions = {},
): Promise<RawDoc> {
  const kind = kindForFile(file);
  if (!kind) throw new Error(`unsupported file type: ${file.name} (${file.type})`);

  let content: string;
  if (kind === 'upload-pdf') {
    if (!opts.pdfExtract) {
      // Fallback: read PDF as text (won't extract well, but won't crash)
      // Real extraction needs pdfjs-dist which is optional
      try {
        content = await readAsText(file);
        // If it starts with %PDF, it's binary — not useful as text
        if (content.startsWith('%PDF')) {
          content = `[PDF file: ${file.name} — PDF text extraction not available. Install pdfjs-dist for proper extraction.]`;
        }
      } catch {
        content = `[PDF file: ${file.name} — could not extract text]`;
      }
    } else {
      content = await opts.pdfExtract(file);
    }
  } else {
    content = await readAsText(file);
  }

  const id = newShortId();
  const date = todayDir();
  const title = baseName(file.name);

  const mdPath = rawPath(date, id);
  const metaP = rawMetaPath(date, id);
  await store.writeText(mdPath, content);
  const meta: RawMetaJson = {
    id,
    title,
    source_url: null,
    captured_at: new Date().toISOString(),
    kind,
  };
  await store.writeJSON(metaP, meta);

  return {
    id,
    path: mdPath.replace(/\.md$/, ''),
    title,
    source_url: null,
    captured_at: meta.captured_at,
    content,
    images: [],
  };
}
