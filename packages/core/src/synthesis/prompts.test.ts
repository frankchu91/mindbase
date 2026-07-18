import { describe, it, expect } from 'vitest';
import { buildSynthesisPrompt, buildContradictionPrompt, buildMissingLinksPrompt } from './prompts';

describe('buildSynthesisPrompt', () => {
  it('includes topic + numbered lines of each note', () => {
    const p = buildSynthesisPrompt({
      topic: 'RAG',
      notes: [
        { slug: 'note-a', title: 'A', body: 'L1\nL2', updated: '2026-05-01' },
        { slug: 'note-b', title: 'B', body: 'X', updated: '2026-05-02' },
      ],
    });
    expect(p).toContain('"RAG"');
    expect(p).toContain('note-a');
    expect(p).toContain('1: L1');
    expect(p).toContain('2: L2');
    expect(p).toContain('note-b');
    expect(p).toContain('JSON');
  });

  it('mentions language matching rule', () => {
    const p = buildSynthesisPrompt({ topic: 't', notes: [] });
    expect(p.toLowerCase()).toContain('language');
  });
});

describe('buildContradictionPrompt', () => {
  it('includes all notes + JSON response requirement', () => {
    const p = buildContradictionPrompt({
      notes: [{ slug: 's', title: 'T', body: 'B', updated: 'd' }],
    });
    expect(p).toContain('contradictions');
    expect(p).toContain('confidence');
  });
});

describe('buildMissingLinksPrompt', () => {
  it('frames "this note" vs "candidates"', () => {
    const p = buildMissingLinksPrompt({
      thisNote: { slug: 'a', title: 'A', body: 'b' },
      candidates: [{ slug: 'c', title: 'C', summary: 's' }],
    });
    expect(p).toContain('THIS NOTE');
    expect(p).toContain('CANDIDATE');
    expect(p).toContain('missing_links');
  });
});
