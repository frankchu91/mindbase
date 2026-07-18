import { createHash } from 'node:crypto';

export interface ExtractedImage {
  /** sha256 of the binary, first 12 hex chars — used as filename prefix. */
  hash: string;
  /** ".png" | ".jpg" | ".gif" | ".webp" */
  ext: string;
  /** Original alt text from the markdown ![alt](...) syntax. */
  alt: string;
  /** Decoded binary content. */
  data: Buffer;
}

export interface ExtractionResult {
  /** Original markdown with inline base64 blocks replaced by attachment URLs. */
  rewrittenMarkdown: string;
  /** One entry per extracted image, ready to write to disk. */
  extracted: ExtractedImage[];
}

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

// Matches ![alt](data:image/<mime>;base64,<payload>) with greedy alt that excludes ']'.
const INLINE_IMAGE_RE = /!\[([^\]]*)\]\(data:image\/([a-z+\-.]+);base64,([A-Za-z0-9+/=]+)\)/g;

export function extractBase64Images(
  markdown: string,
  attachmentUrlPrefix: string,
): ExtractionResult {
  const extracted: ExtractedImage[] = [];

  const rewritten = markdown.replace(INLINE_IMAGE_RE, (match, alt: string, mime: string, b64: string) => {
    const ext = MIME_TO_EXT[`image/${mime}`];
    if (!ext) return match;  // unknown image MIME — leave the block alone

    let data: Buffer;
    try {
      data = Buffer.from(b64, 'base64');
    } catch {
      return match;  // malformed base64 — leave alone
    }
    if (data.length === 0) return match;

    const hash = createHash('sha256').update(data).digest('hex').slice(0, 12);
    extracted.push({ hash, ext, alt, data });

    const url = `${attachmentUrlPrefix.replace(/\/+$/, '')}/${hash}${ext}`;
    return `![${alt}](${url})`;
  });

  return { rewrittenMarkdown: rewritten, extracted };
}
