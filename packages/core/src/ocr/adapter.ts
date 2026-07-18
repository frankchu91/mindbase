export interface OCRResult {
  /** Recognized text. Empty string if no text found / OCR failed. */
  text: string;
  /** Average per-word confidence, 0–100. 0 if no text or OCR off. */
  confidence: number;
  /** Best-guess language(s) detected. Optional. */
  langDetected?: string;
  /** How long the OCR call took in milliseconds. */
  durationMs: number;
}

export interface OCRAdapter {
  /** Stable identifier — written into the .ocr.meta.json sidecar. */
  readonly name: string;

  /** Whether this backend works in the current environment. */
  available(): Promise<boolean>;

  /** Run OCR on a single image file. Throw on failure; caller logs + writes error meta. */
  ocr(imagePath: string, opts?: { langs?: string[] }): Promise<OCRResult>;
}

/**
 * No-op backend: returns empty text. Used when MINDBASE_OCR=off or in unit tests.
 * Downstream consumers (classify/search/embedding) gracefully handle empty OCR.
 */
export class NoopOCRAdapter implements OCRAdapter {
  readonly name = 'noop';
  async available(): Promise<boolean> { return true; }
  async ocr(): Promise<OCRResult> {
    return { text: '', confidence: 0, durationMs: 0 };
  }
}
