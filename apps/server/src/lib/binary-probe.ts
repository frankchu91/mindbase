// Binary file passthrough helpers.
import fs from 'node:fs/promises';
import path from 'node:path';

export const BINARY_EXTS = ['pdf', 'docx', 'doc', 'epub', 'odt'] as const;

/** Return { hasBinary, binaryExt } for a raw doc by probing disk. */
export async function probeBinary(
  dataDir: string,
  rawPrefix: string, // e.g. "raw/2026-05-22/abc123"
): Promise<{ hasBinary: boolean; binaryExt?: string; binarySuffix?: string }> {
  // Two naming conventions exist on disk:
  //   1. `<prefix>.<ext>`           — ingestPaste convention (Drive sync etc.)
  //   2. `<prefix>.original.<ext>`  — saveOriginalFile convention (web upload, RSS)
  // Check both per extension.
  for (const ext of BINARY_EXTS) {
    for (const suffix of ['', '.original']) {
      const full = path.join(dataDir, `${rawPrefix}${suffix}.${ext}`);
      try {
        await fs.access(full);
        return { hasBinary: true, binaryExt: ext, binarySuffix: suffix };
      } catch { /* not found */ }
    }
  }
  return { hasBinary: false };
}
