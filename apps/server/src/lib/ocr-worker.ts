import { promises as fs } from 'node:fs';
import type { ServerContext } from '../context';

interface OcrMetaJson {
  image_path: string;
  ocr_backend: string;
  ocr_lang?: string;
  ocr_confidence: number;
  ocr_text_length: number;
  ocr_started_at: string;
  ocr_completed_at: string;
  ocr_duration_ms: number;
  error?: string;
}

/**
 * Fire-and-forget OCR trigger. Writes <imagePath>.ocr.txt and <imagePath>.ocr.meta.json
 * sidecar files. Idempotent: if the meta file already exists, skip (don't re-OCR).
 * Never throws to the caller; logs errors and writes an error meta so we don't retry.
 */
export function runOcrAsync(ctx: ServerContext, imagePath: string): void {
  void (async () => {
    const txtPath = imagePath + '.ocr.txt';
    const metaPath = imagePath + '.ocr.meta.json';
    try {
      try {
        await fs.access(metaPath);
        return; // already processed
      } catch { /* doesn't exist; proceed */ }

      const startedAt = new Date().toISOString();
      const t0 = Date.now();
      const shortName = imagePath.split('/').slice(-2).join('/');
      console.log(`[ocr-worker] ${shortName}: started (backend=${ctx.ocrAdapter.name})`);
      try {
        const result = await ctx.ocrAdapter.ocr(imagePath);
        const completedAt = new Date().toISOString();
        const meta: OcrMetaJson = {
          image_path: imagePath,
          ocr_backend: ctx.ocrAdapter.name,
          ocr_lang: result.langDetected,
          ocr_confidence: result.confidence,
          ocr_text_length: result.text.length,
          ocr_started_at: startedAt,
          ocr_completed_at: completedAt,
          ocr_duration_ms: result.durationMs,
        };
        await fs.writeFile(txtPath, result.text, 'utf-8');
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        const preview = result.text.replace(/\s+/g, ' ').trim().slice(0, 80);
        console.log(`[ocr-worker] ${shortName}: ${result.text.length} chars, conf=${result.confidence.toFixed(0)} (${result.durationMs}ms) — "${preview}${result.text.length > 80 ? '…' : ''}"`);
      } catch (e) {
        const completedAt = new Date().toISOString();
        const meta: OcrMetaJson = {
          image_path: imagePath,
          ocr_backend: ctx.ocrAdapter.name,
          ocr_confidence: 0,
          ocr_text_length: 0,
          ocr_started_at: startedAt,
          ocr_completed_at: completedAt,
          ocr_duration_ms: Date.now() - t0,
          error: (e as Error).message,
        };
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        console.error(`[ocr-worker] ${imagePath} failed: ${(e as Error).message}`);
      }
    } catch (outer) {
      console.error(`[ocr-worker] unexpected ${imagePath}:`, outer);
    }
  })();
}
