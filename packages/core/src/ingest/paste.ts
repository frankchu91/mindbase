import type { Store } from '../storage/store';
import type { CaptureSurface, RawDoc, RawMetaJson } from '../types';
import { newShortId } from '../storage/ids';
import { rawMetaPath, rawPath, todayDir } from '../storage/paths';

/** Map of file extension to MIME type for supported binary formats. */
const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  epub: 'application/epub+zip',
};

export interface PasteInput {
  text: string;
  title?: string;
  source_url?: string | null;
  /** Capture surface — set when the paste originates from the universal capture pipeline. */
  captured_via?: CaptureSurface;
  /** Human-readable device name (or device id when name is unavailable). */
  captured_device?: string;
  /** ISO timestamp; if provided, overrides "now". */
  captured_at?: string;
  /** Source kind — defaults to 'paste'. Captures pass 'capture'. */
  kind?: RawMetaJson['kind'];
  tags?: string[];
  /**
   * Optional binary content (e.g. the original PDF file). When provided
   * together with `binary_ext`, the binary is written alongside the .md and
   * binary_path / binary_mime are populated on the returned RawDoc.
   */
  binary?: Uint8Array | ArrayBuffer | Buffer;
  /** File extension for the binary, e.g. 'pdf' or 'docx' (no leading dot). */
  binary_ext?: string;
}

/** RawMetaJson extended with optional binary fields persisted to .meta.json. */
interface RawMetaJsonWithBinary extends RawMetaJson {
  binary_path?: string;
  binary_mime?: string;
}

export async function ingestPaste(store: Store, input: PasteInput): Promise<RawDoc> {
  const id = newShortId();
  const date = todayDir();
  const title =
    input.title ??
    input.text.split('\n').find((l) => l.trim().length > 0)?.slice(0, 80) ??
    'Untitled';

  const mdPath = rawPath(date, id);
  const metaP = rawMetaPath(date, id);
  await store.writeText(mdPath, input.text);
  const captured_at = input.captured_at ?? new Date().toISOString();

  // Resolve binary fields if a binary blob was supplied
  let binary_path: string | undefined;
  let binary_mime: string | undefined;
  if (input.binary && input.binary_ext) {
    const ext = input.binary_ext.replace(/^\./, '').toLowerCase();
    const mime = EXT_TO_MIME[ext];
    if (mime) {
      const binPath = `raw/${date}/${id}.${ext}`;
      const data =
        input.binary instanceof Uint8Array
          ? input.binary
          : new Uint8Array(input.binary instanceof ArrayBuffer ? input.binary : (input.binary as Buffer));
      await store.writeBinary(binPath, data);
      binary_path = binPath;
      binary_mime = mime;
    }
  }

  const meta: RawMetaJsonWithBinary = {
    id,
    title,
    source_url: input.source_url ?? null,
    captured_at,
    kind: input.kind ?? 'paste',
    ...(input.captured_via ? { captured_via: input.captured_via } : {}),
    ...(input.captured_device ? { captured_device: input.captured_device } : {}),
    ...(input.tags && input.tags.length ? { tags: input.tags } : {}),
    ...(binary_path ? { binary_path, binary_mime } : {}),
  };
  await store.writeJSON(metaP, meta);

  return {
    id,
    path: mdPath.replace(/\.md$/, ''),
    title,
    source_url: meta.source_url,
    captured_at: meta.captured_at,
    content: input.text,
    images: [],
    ...(input.captured_via ? { captured_via: input.captured_via } : {}),
    ...(input.captured_device ? { captured_device: input.captured_device } : {}),
    ...(input.tags && input.tags.length ? { tags: input.tags } : {}),
    ...(binary_path ? { binary_path, binary_mime } : {}),
  };
}
