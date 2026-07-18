import { describe, it, expect } from 'vitest';
import { backlinkBoost, recencyBoost, exactMatchBoost } from './retrieval-signals';

describe('backlinkBoost', () => {
  it('returns 1.0 for 0 inbound links', () => {
    expect(backlinkBoost(0)).toBeCloseTo(1.0, 5);
  });

  it('returns >1 for any positive inbound count', () => {
    expect(backlinkBoost(1)).toBeGreaterThan(1.0);
    expect(backlinkBoost(10)).toBeGreaterThan(1.0);
  });

  it('boost grows logarithmically — diminishing returns', () => {
    const at1 = backlinkBoost(1) - 1;
    const at100 = backlinkBoost(100) - 1;
    expect(at100 / at1).toBeLessThan(10);  // log scale, not linear
    expect(at100 / at1).toBeGreaterThan(4);
  });

  it('formula matches 1 + 0.05 * log(1 + n)', () => {
    expect(backlinkBoost(20)).toBeCloseTo(1 + 0.05 * Math.log(21), 6);
  });

  it('handles negative or NaN input safely (returns 1.0)', () => {
    expect(backlinkBoost(-5)).toBe(1.0);
    expect(backlinkBoost(Number.NaN)).toBe(1.0);
  });
});

describe('recencyBoost', () => {
  it('returns 1.0 for a page updated today', () => {
    const now = new Date('2026-05-22T12:00:00Z');
    expect(recencyBoost(now.toISOString(), now)).toBeCloseTo(1.0, 5);
  });

  it('returns 1.0 within the 7-day grace period', () => {
    const now = new Date('2026-05-22T00:00:00Z');
    const sixDaysAgo = new Date(now.getTime() - 6 * 86_400_000);
    expect(recencyBoost(sixDaysAgo.toISOString(), now)).toBe(1.0);
  });

  it('decays after the 7-day grace period', () => {
    const now = new Date('2026-05-22T00:00:00Z');
    const eightDaysAgo = new Date(now.getTime() - 8 * 86_400_000);
    expect(recencyBoost(eightDaysAgo.toISOString(), now)).toBeLessThan(1.0);
  });

  it('half-life is ~60 days past the grace period', () => {
    const now = new Date('2026-05-22T00:00:00Z');
    const sixtySevenDaysAgo = new Date(now.getTime() - (7 + 60) * 86_400_000);
    const v = recencyBoost(sixtySevenDaysAgo.toISOString(), now);
    expect(v).toBeGreaterThan(0.45);
    expect(v).toBeLessThan(0.55);
  });

  it('returns 1.0 for missing/invalid timestamp', () => {
    const now = new Date();
    expect(recencyBoost(null, now)).toBe(1.0);
    expect(recencyBoost('', now)).toBe(1.0);
    expect(recencyBoost('not-a-date', now)).toBe(1.0);
  });
});

describe('exactMatchBoost', () => {
  it('returns 1.0 for empty query', () => {
    expect(exactMatchBoost('', 'RAG')).toBe(1.0);
  });

  it('returns 1.10 when the query appears as a token in the title (case-insensitive)', () => {
    expect(exactMatchBoost('rag', 'Retrieval-Augmented Generation (RAG)')).toBeCloseTo(1.10, 5);
    expect(exactMatchBoost('RAG', 'retrieval-augmented generation (rag)')).toBeCloseTo(1.10, 5);
  });

  it('returns 1.0 when query is a substring but not a token boundary match', () => {
    // "rag" is inside "fragment" — substring but not a whole word.
    expect(exactMatchBoost('rag', 'A fragment of text')).toBe(1.0);
  });

  it('handles missing title', () => {
    expect(exactMatchBoost('rag', '')).toBe(1.0);
    expect(exactMatchBoost('rag', null)).toBe(1.0);
  });
});
