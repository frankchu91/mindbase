// Attachment-writing helpers used by wiki/notes routes when saving markdown
// bodies that contain base64-encoded images.
//
// Extracted from apps/server/src/routes/wiki.ts as part of the wiki v2
// refactor (Phase A). Preserves the exact on-disk convention wiki.ts uses:
//   <dataDir>/attachments/<slug>/<hash><ext>
// with public URLs served at /api/wiki/attachments/<slug>/<hash><ext>.
//
// Fire-and-forget OCR is triggered per image via a caller-supplied callback so
// this module stays free of ServerContext / worker imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractBase64Images } from '@mindbase/core';
import type { ExtractedImage, ExtractionResult } from '@mindbase/core';

export { extractBase64Images };
export type { ExtractedImage, ExtractionResult };

export interface WriteAttachmentsOptions {
  /** Data root (typically ctx.dataDir). */
  dataDir: string;
  /** Slug the attachments are scoped under. */
  slug: string;
  /** Markdown body possibly containing inline `data:image/*;base64,...` blocks. */
  body: string;
  /** Called for each written image file (absolute path). Used to fire OCR. */
  onImageWritten?: (absolutePath: string) => void;
}

export interface WriteAttachmentsResult {
  /** Rewritten markdown with base64 blocks replaced by attachment URLs. */
  content: string;
  /** Images that were extracted and written to disk. */
  extracted: ExtractedImage[];
}

/**
 * Extract inline base64 images from `body`, write them under
 * `<dataDir>/attachments/<slug>/<hash><ext>`, and return the rewritten
 * markdown. If no images are found, returns the body unchanged.
 */
export async function writeAttachmentsAndRewrite(
  opts: WriteAttachmentsOptions,
): Promise<WriteAttachmentsResult> {
  const { dataDir, slug, body, onImageWritten } = opts;
  const attachmentUrlPrefix = `/api/wiki/attachments/${slug}`;
  const attachmentDir = path.join(dataDir, 'attachments', slug);
  const extraction: ExtractionResult = extractBase64Images(body, attachmentUrlPrefix);
  if (extraction.extracted.length === 0) {
    return { content: body, extracted: [] };
  }
  await fs.mkdir(attachmentDir, { recursive: true });
  for (const img of extraction.extracted) {
    const fullPath = path.join(attachmentDir, `${img.hash}${img.ext}`);
    await fs.writeFile(fullPath, img.data);
    onImageWritten?.(fullPath);
  }
  return { content: extraction.rewrittenMarkdown, extracted: extraction.extracted };
}
