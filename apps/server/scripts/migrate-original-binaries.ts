/**
 * One-shot migration: convert legacy `.original.<ext>` files that were
 * stored as base64-encoded text back into raw binary, and backfill the
 * `binary_path` + `binary_mime` fields on each raw doc's meta.json.
 *
 * Background: an older version of `saveOriginalFile` called
 * `store.writeText(path, buffer.toString('base64'))`, which meant every
 * "original" PDF/DOCX on disk was actually a 4/3-bloated base64 string
 * inside a file with a misleading binary extension. This script normalizes
 * them so the new LLM-native PDF path (Anthropic document blocks, OpenAI
 * Responses API) can read the real binary.
 *
 * Idempotent: skips files that already start with the expected magic bytes.
 *
 * Run via: pnpm tsx apps/server/scripts/migrate-original-binaries.ts
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env['MINDBASE_DATA_DIR'] ?? path.join(process.env['HOME'] ?? '', 'mindbase-data');
const RAW_DIR = path.join(DATA_DIR, 'raw');

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  epub: 'application/epub+zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const MAGIC_BYTES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46],   // %PDF
  docx: [0x50, 0x4B, 0x03, 0x04],  // PK..
  doc: [0xD0, 0xCF, 0x11, 0xE0],   // OLE2
  epub: [0x50, 0x4B, 0x03, 0x04],  // PK..
  png: [0x89, 0x50, 0x4E, 0x47],
  jpg: [0xFF, 0xD8, 0xFF],
  jpeg: [0xFF, 0xD8, 0xFF],
  gif: [0x47, 0x49, 0x46, 0x38],
  webp: [0x52, 0x49, 0x46, 0x46],  // RIFF
};

function startsWithMagic(buf: Buffer, magic: number[]): boolean {
  if (buf.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buf[i] !== magic[i]) return false;
  }
  return true;
}

interface OriginalFile {
  prefix: string;        // 'raw/2026-05-22/abc123'
  fullPath: string;      // absolute path
  ext: string;           // 'pdf'
  rawId: string;         // 'abc123'
  date: string;          // '2026-05-22'
}

async function listOriginalFiles(): Promise<OriginalFile[]> {
  const out: OriginalFile[] = [];
  let dateDirs: string[];
  try {
    dateDirs = await fs.readdir(RAW_DIR);
  } catch {
    console.log(`[migrate] No raw dir at ${RAW_DIR} — nothing to do.`);
    return [];
  }
  for (const date of dateDirs) {
    const dateAbs = path.join(RAW_DIR, date);
    let stat;
    try { stat = await fs.stat(dateAbs); } catch { continue; }
    if (!stat.isDirectory()) continue;
    const files = await fs.readdir(dateAbs);
    for (const f of files) {
      const m = f.match(/^(.+?)\.original\.([a-zA-Z0-9]+)$/);
      if (!m) continue;
      const [, rawId, extRaw] = m;
      if (!rawId || !extRaw) continue;
      const ext = extRaw.toLowerCase();
      out.push({
        prefix: path.posix.join('raw', date, rawId),
        fullPath: path.join(dateAbs, f),
        ext,
        rawId,
        date,
      });
    }
  }
  return out;
}

async function migrateOne(file: OriginalFile): Promise<{ action: string; ok: boolean; reason?: string }> {
  const mime = EXT_TO_MIME[file.ext];
  if (!mime) return { action: 'skip-unknown-ext', ok: true };

  // Read first chunk to determine current state
  const handle = await fs.open(file.fullPath, 'r');
  const head = Buffer.alloc(64);
  await handle.read(head, 0, 64, 0);
  await handle.close();

  const magic = MAGIC_BYTES[file.ext];
  const looksBinary = magic ? startsWithMagic(head, magic) : false;

  if (!looksBinary) {
    // Probably base64 text. Read full, decode, rewrite as binary.
    const text = await fs.readFile(file.fullPath, 'utf-8');
    const cleaned = text.trim();
    let decoded: Buffer;
    try {
      decoded = Buffer.from(cleaned, 'base64');
    } catch {
      return { action: 'skip-base64-decode-failed', ok: false, reason: 'cannot decode' };
    }
    // Verify decoded looks like the expected file
    if (magic && !startsWithMagic(decoded, magic)) {
      return { action: 'skip-decoded-no-magic', ok: false, reason: `decoded bytes do not start with expected magic for .${file.ext}` };
    }
    await fs.writeFile(file.fullPath, decoded);
  }

  // Backfill meta.json regardless of whether we rewrote the binary
  const metaPath = path.join(RAW_DIR, file.date, `${file.rawId}.meta.json`);
  try {
    const metaText = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(metaText) as Record<string, unknown>;
    const binaryPath = `raw/${file.date}/${file.rawId}.original.${file.ext}`;
    let metaChanged = false;
    if (meta['binary_path'] !== binaryPath) { meta['binary_path'] = binaryPath; metaChanged = true; }
    if (meta['binary_mime'] !== mime) { meta['binary_mime'] = mime; metaChanged = true; }
    if (metaChanged) {
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    }
    return { action: looksBinary ? 'meta-only' : 'rewrote-binary+meta', ok: true };
  } catch (e) {
    return { action: looksBinary ? 'skip-meta-missing' : 'rewrote-binary-only', ok: !looksBinary, reason: (e as Error).message };
  }
}

async function main() {
  console.log(`[migrate] Scanning ${RAW_DIR} for .original.* files…`);
  const files = await listOriginalFiles();
  console.log(`[migrate] Found ${files.length} candidate file(s)`);
  const counts: Record<string, number> = {};
  for (const f of files) {
    const r = await migrateOne(f);
    counts[r.action] = (counts[r.action] ?? 0) + 1;
    const label = r.ok ? '✓' : '✗';
    console.log(`  ${label} ${f.rawId}.original.${f.ext} — ${r.action}${r.reason ? ` (${r.reason})` : ''}`);
  }
  console.log('[migrate] Summary:');
  for (const [action, n] of Object.entries(counts)) {
    console.log(`  ${action}: ${n}`);
  }
  console.log('[migrate] Done.');
}

await main();
