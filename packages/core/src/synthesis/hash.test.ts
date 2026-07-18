import { describe, it, expect } from 'vitest';
import { sourceHashOf, hashMap } from './hash';

describe('sourceHashOf', () => {
  it('produces stable sha256 hex prefix', () => {
    const h = sourceHashOf('# Hello\n\nBody.');
    expect(h).toMatch(/^sha256:[a-f0-9]{16}$/);
  });

  it('same input → same hash', () => {
    expect(sourceHashOf('abc')).toBe(sourceHashOf('abc'));
  });

  it('different input → different hash', () => {
    expect(sourceHashOf('abc')).not.toBe(sourceHashOf('def'));
  });
});

describe('hashMap', () => {
  it('returns slug → hash dictionary', async () => {
    const map = await hashMap([
      { slug: 'foo', body: 'foo body' },
      { slug: 'bar', body: 'bar body' },
    ]);
    expect(Object.keys(map).sort()).toEqual(['bar', 'foo']);
    expect(map['foo']).toMatch(/^sha256:/);
  });
});
