import type { OCRAdapter, OCRResult } from '@mindbase/core';

/**
 * tesseract.js (WASM) OCR backend.
 *
 * Lazy-initialized worker singleton — first call pays ~3-5s init + lang-data
 * download (~25 MB, cached after first run). Subsequent calls are fast
 * (~0.5–10s per image depending on size). Worker is reused across calls;
 * we never terminate it (server-lifetime worker).
 *
 * Default langs: English + Simplified Chinese. Override via opts.langs.
 */
export class TesseractWasmAdapter implements OCRAdapter {
  readonly name = 'tesseract-wasm';

  private workerPromise: Promise<unknown> | null = null;
  private currentLangs = 'eng+chi_sim';

  async available(): Promise<boolean> {
    // tesseract.js works in any Node environment. The only failure mode is
    // network blocked on first run (lang data download). We can't probe that
    // cheaply, so we report available and let the first ocr() call surface
    // any init error to the worker which logs + writes error meta.
    return true;
  }

  async ocr(imagePath: string, opts?: { langs?: string[] }): Promise<OCRResult> {
    const langs = (opts?.langs ?? ['eng', 'chi_sim']).join('+');
    const t0 = Date.now();

    // Lazy import — tesseract.js drags in a few MB of WASM glue we don't want
    // to pay for unless OCR is actually used.
    const { createWorker } = await import('tesseract.js');

    if (!this.workerPromise || this.currentLangs !== langs) {
      this.currentLangs = langs;
      this.workerPromise = createWorker(langs);
    }
    const worker = (await this.workerPromise) as Awaited<ReturnType<typeof createWorker>>;

    const { data } = await worker.recognize(imagePath);
    const durationMs = Date.now() - t0;
    return {
      text: data.text ?? '',
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      langDetected: langs,
      durationMs,
    };
  }
}
