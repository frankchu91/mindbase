import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { ensureSchema } from '../graph/index/schema';
import { AnalysisCache, ContradictionCache } from './cache';

describe('AnalysisCache', () => {
  let db: Database.Database;
  let cache: AnalysisCache;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureSchema(db);
    cache = new AnalysisCache(db);
  });

  it('returns null for missing key', () => {
    expect(cache.get('god_nodes')).toBeNull();
  });

  it('put → get round-trip preserves payload', () => {
    cache.put('god_nodes', { slugs: ['rag', 'transformer'], threshold: 5 });
    const out = cache.get<{ slugs: string[]; threshold: number }>('god_nodes');
    expect(out?.payload.slugs).toEqual(['rag', 'transformer']);
    expect(out?.payload.threshold).toBe(5);
    expect(typeof out?.computedAt).toBe('string');
  });

  it('put on existing key replaces (one row per kind)', () => {
    cache.put('god_nodes', { slugs: ['a'] });
    cache.put('god_nodes', { slugs: ['b'] });
    const rows = db.prepare(`SELECT COUNT(*) as n FROM analysis_cache WHERE kind=?`).get('god_nodes') as { n: number };
    expect(rows.n).toBe(1);
    expect(cache.get<{ slugs: string[] }>('god_nodes')?.payload.slugs).toEqual(['b']);
  });

  it('isStale returns true when payload is older than maxAgeMs', () => {
    cache.put('god_nodes', { slugs: [] });
    // Force a stale timestamp
    db.prepare(`UPDATE analysis_cache SET computed_at='2020-01-01T00:00:00Z' WHERE kind=?`).run('god_nodes');
    expect(cache.isStale('god_nodes', 60_000)).toBe(true);
    expect(cache.isStale('missing_key', 60_000)).toBe(true);
  });

  it('isStale returns false when payload is fresh', () => {
    cache.put('god_nodes', { slugs: [] });
    expect(cache.isStale('god_nodes', 60_000)).toBe(false);
  });
});

describe('ContradictionCache', () => {
  let db: Database.Database;
  let cache: ContradictionCache;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureSchema(db);
    cache = new ContradictionCache(db);
  });

  it('returns null for missing verdict', () => {
    expect(cache.get('a', 'b', 'gpt-4o', 'judge/v1')).toBeNull();
  });

  it('put → get round-trip preserves verdict', () => {
    cache.put({ slugA: 'a', slugB: 'b', modelId: 'gpt-4o', promptVersion: 'judge/v1', verdict: 'contradicts', reason: 'whatever' });
    const out = cache.get('a', 'b', 'gpt-4o', 'judge/v1');
    expect(out?.verdict).toBe('contradicts');
    expect(out?.reason).toBe('whatever');
  });

  it('listConfirmed returns only verdict=contradicts entries', () => {
    cache.put({ slugA: 'a', slugB: 'b', modelId: 'm', promptVersion: 'v', verdict: 'contradicts', reason: 'r' });
    cache.put({ slugA: 'a', slugB: 'c', modelId: 'm', promptVersion: 'v', verdict: 'compatible', reason: 'r' });
    cache.put({ slugA: 'a', slugB: 'd', modelId: 'm', promptVersion: 'v', verdict: 'unrelated', reason: 'r' });
    const confirmed = cache.listConfirmed();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]?.slugA).toBe('a');
    expect(confirmed[0]?.slugB).toBe('b');
  });

  it('re-put with same (slug_a, slug_b, model, version) replaces', () => {
    cache.put({ slugA: 'a', slugB: 'b', modelId: 'm', promptVersion: 'v', verdict: 'contradicts', reason: 'first' });
    cache.put({ slugA: 'a', slugB: 'b', modelId: 'm', promptVersion: 'v', verdict: 'compatible', reason: 'second' });
    const out = cache.get('a', 'b', 'm', 'v');
    expect(out?.verdict).toBe('compatible');
    expect(out?.reason).toBe('second');
  });

  it('put preserves id on replace (DO UPDATE, not REPLACE)', () => {
    cache.put({ slugA: 'a', slugB: 'b', modelId: 'm', promptVersion: 'v', verdict: 'contradicts', reason: 'first' });
    const firstId = cache.get('a', 'b', 'm', 'v')?.id;
    expect(firstId).toBeGreaterThan(0);
    cache.put({ slugA: 'a', slugB: 'b', modelId: 'm', promptVersion: 'v', verdict: 'compatible', reason: 'second' });
    const secondId = cache.get('a', 'b', 'm', 'v')?.id;
    expect(secondId).toBe(firstId);
  });

  it('put accepts reason: null and get returns reason: null', () => {
    cache.put({ slugA: 'x', slugB: 'y', modelId: 'm', promptVersion: 'v', verdict: 'unrelated', reason: null });
    const out = cache.get('x', 'y', 'm', 'v');
    expect(out).not.toBeNull();
    expect(out?.reason).toBeNull();
  });
});
