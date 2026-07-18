import { describe, it, expect } from 'vitest';
import { NoopOCRAdapter } from './adapter';

describe('NoopOCRAdapter', () => {
  it('returns name "noop"', () => {
    const a = new NoopOCRAdapter();
    expect(a.name).toBe('noop');
  });

  it('reports available=true', async () => {
    const a = new NoopOCRAdapter();
    expect(await a.available()).toBe(true);
  });

  it('returns empty text with zero confidence on ocr()', async () => {
    const a = new NoopOCRAdapter();
    const r = await a.ocr('/tmp/does-not-matter.png');
    expect(r.text).toBe('');
    expect(r.confidence).toBe(0);
    expect(r.durationMs).toBe(0);
  });
});
