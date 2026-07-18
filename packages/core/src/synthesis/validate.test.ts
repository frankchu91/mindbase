import { describe, it, expect } from 'vitest';
import { validateSynthesis } from './validate';

const SOURCES = new Map<string, string[]>([
  ['note-a', ['First line', 'Second line', 'Third line']],
  ['note-b', ['Only line']],
]);

describe('validateSynthesis', () => {
  it('drops citations whose slug is missing', () => {
    const raw = {
      summary: 'OK',
      threads: [{
        heading: 'h',
        content: 'sentence [note-x:1-2].',
        citations: [{ slug: 'note-x', line_range: [1, 2] as [number, number] }],
      }],
      contradictions: [],
      gaps: [],
    };
    const out = validateSynthesis(raw, SOURCES);
    expect(out.threads).toHaveLength(0);
  });

  it('drops citations whose line_range is out of bounds', () => {
    const raw = {
      summary: '',
      threads: [{
        heading: 'h',
        content: 'sentence [note-b:5-10].',
        citations: [{ slug: 'note-b', line_range: [5, 10] as [number, number] }],
      }],
      contradictions: [], gaps: [],
    };
    const out = validateSynthesis(raw, SOURCES);
    expect(out.threads).toHaveLength(0);
  });

  it('keeps valid citations', () => {
    const raw = {
      summary: '',
      threads: [{
        heading: 'h',
        content: 'sentence [note-a:1-2].',
        citations: [{ slug: 'note-a', line_range: [1, 2] as [number, number] }],
      }],
      contradictions: [], gaps: [],
    };
    const out = validateSynthesis(raw, SOURCES);
    expect(out.threads).toHaveLength(1);
    expect(out.threads[0]!.citations).toHaveLength(1);
  });

  it('drops uncited sentences inside content', () => {
    const raw = {
      summary: '',
      threads: [{
        heading: 'h',
        content: 'Valid sentence [note-a:1-2]. Uncited sentence. Another valid one [note-a:3-3].',
        citations: [
          { slug: 'note-a', line_range: [1, 2] as [number, number] },
          { slug: 'note-a', line_range: [3, 3] as [number, number] },
        ],
      }],
      contradictions: [], gaps: [],
    };
    const out = validateSynthesis(raw, SOURCES);
    expect(out.threads[0]!.content).not.toContain('Uncited sentence');
    expect(out.threads[0]!.content).toContain('Valid sentence');
  });

  it('drops contradictions with missing with_slug', () => {
    const raw = {
      summary: '', threads: [],
      contradictions: [{
        with_slug: 'ghost',
        your_claim_excerpt: '',
        conflicting_claim_excerpt: '',
        confidence: 'high' as const,
      }],
      gaps: [],
    };
    const out = validateSynthesis(raw, SOURCES);
    expect(out.contradictions).toHaveLength(0);
  });

  it('drops gaps whose related_notes contain unknown slugs', () => {
    const raw = {
      summary: '', threads: [],
      contradictions: [],
      gaps: [{ suggestion: 's', related_notes: ['ghost'] }],
    };
    const out = validateSynthesis(raw, SOURCES);
    expect(out.gaps).toHaveLength(0);
  });
});
