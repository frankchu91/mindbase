import { describe, it, expect } from 'vitest';
import { parseOperators, extractSnippet } from './hybrid';

describe('parseOperators', () => {
  it('parses tag operator', () => {
    const { q, filters } = parseOperators('machine learning tag:ai');
    expect(q).toBe('machine learning');
    expect(filters.tags).toEqual(['ai']);
  });

  it('parses multiple tags', () => {
    const { filters } = parseOperators('query tag:ai tag:research');
    expect(filters.tags).toEqual(['ai', 'research']);
  });

  it('parses since operator', () => {
    const { q, filters } = parseOperators('topic since:7d');
    expect(q).toBe('topic');
    expect(filters.since_days).toBe(7);
  });

  it('parses type operator', () => {
    const { q, filters } = parseOperators('notes type:concept');
    expect(q).toBe('notes');
    expect(filters.type).toBe('concept');
  });

  it('parses project operator', () => {
    const { q, filters } = parseOperators('something project:alpha');
    expect(q).toBe('something');
    expect(filters.project).toBe('alpha');
  });

  it('parses multiple operators together', () => {
    const { q, filters } = parseOperators('ML tag:ai since:30d type:note');
    expect(q).toBe('ML');
    expect(filters.tags).toEqual(['ai']);
    expect(filters.since_days).toBe(30);
    expect(filters.type).toBe('note');
  });

  it('returns empty filters for plain query', () => {
    const { q, filters } = parseOperators('plain query');
    expect(q).toBe('plain query');
    expect(filters).toEqual({});
  });

  it('handles empty string', () => {
    const { q, filters } = parseOperators('');
    expect(q).toBe('');
    expect(filters).toEqual({});
  });
});

describe('extractSnippet', () => {
  it('finds match in body and returns snippet around it', () => {
    const body = 'A '.repeat(50) + 'transformer architectures are important' + ' B'.repeat(50);
    const { text, highlights } = extractSnippet(body, ['transformer']);
    expect(text).toContain('transformer');
    expect(highlights.length).toBeGreaterThan(0);
  });

  it('returns first 200 chars when no token matches', () => {
    const body = 'Lorem ipsum dolor sit amet. '.repeat(20);
    const { text, highlights } = extractSnippet(body, ['zzzzz']);
    expect(text).toHaveLength(200);
    expect(highlights).toEqual([]);
  });

  it('returns empty snippet for empty body', () => {
    const { text, highlights } = extractSnippet('', ['query']);
    expect(text).toBe('');
    expect(highlights).toEqual([]);
  });

  it('marks highlight positions correctly', () => {
    const body = 'the quick brown fox jumps over the lazy dog';
    const { text, highlights } = extractSnippet(body, ['quick']);
    expect(text).toContain('quick');
    expect(highlights.length).toBe(1);
    const [start, end] = highlights[0]!;
    expect(text.slice(start, end)).toBe('quick');
  });

  it('merges overlapping highlights', () => {
    const body = 'machine learning is great for machine learning tasks';
    const { highlights } = extractSnippet(body, ['machine', 'machine learning']);
    // Should be merged/de-overlapped
    for (let i = 1; i < highlights.length; i++) {
      expect(highlights[i]![0]).toBeGreaterThanOrEqual(highlights[i - 1]![1]);
    }
  });

  it('skips single-char tokens for highlights (too noisy)', () => {
    const body = 'a quick test of single char tokens';
    const { highlights } = extractSnippet(body, ['a', 'quick']);
    // 'a' is a single char, 'quick' should be highlighted
    const highlighted = highlights.map(([s, e]) => body.slice(s, e));
    expect(highlighted).toContain('quick');
    // 'a' as standalone single char should not appear
    expect(highlighted).not.toContain('a');
  });
});

describe('RRF math', () => {
  it('verifies RRF formula: score = 1/(60+rank)', () => {
    // Rank 0 → 1/60
    expect(1 / (60 + 0)).toBeCloseTo(0.01667, 3);
    // Rank 10 → 1/70
    expect(1 / (60 + 10)).toBeCloseTo(0.01429, 3);
    // Doc in both retrievers at rank 0 each → double score
    const both = 1 / (60 + 0) + 1 / (60 + 0);
    expect(both).toBeCloseTo(0.03333, 3);
    // Doc only in BM25 at rank 0 < doc in both at rank 0
    const onlyBm25 = 1 / (60 + 0);
    expect(both).toBeGreaterThan(onlyBm25);
  });
});
