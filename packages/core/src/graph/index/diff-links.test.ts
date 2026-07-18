import { describe, it, expect } from 'vitest';
import { diffLinks, type StoredLink } from './diff-links';
import type { ClassifiedLink } from './classify-edges';

function stored(
  target: string,
  edgeType: StoredLink['edgeType'] = 'mentions',
  confidence: StoredLink['confidence'] = 'extracted',
  inferenceRule: string | null = null,
): StoredLink {
  return { target, edgeType, confidence, inferenceRule };
}
function classified(
  target: string,
  edgeType: ClassifiedLink['edgeType'] = 'mentions',
  confidence: ClassifiedLink['confidence'] = 'extracted',
  inferenceRule: string | null = null,
): ClassifiedLink {
  return { target, confidence, contextSnippet: '', section: null, edgeType, inferenceRule };
}

describe('diffLinks', () => {
  it('reports add for new targets', () => {
    const r = diffLinks([], [classified('llm'), classified('rag')]);
    expect(r.toInsert.map((l) => l.target).sort()).toEqual(['llm', 'rag']);
    expect(r.toDelete).toEqual([]);
    expect(r.toUpdate).toEqual([]);
  });

  it('reports remove for vanished targets', () => {
    const r = diffLinks([stored('llm'), stored('rag')], []);
    expect(r.toDelete.map((l) => l.target).sort()).toEqual(['llm', 'rag']);
  });

  it('reports update when confidence changes', () => {
    const r = diffLinks([stored('rag', 'mentions', 'extracted')], [classified('rag', 'mentions', 'inferred')]);
    expect(r.toUpdate.map((l) => l.target)).toEqual(['rag']);
  });

  it('reports update when edgeType changes', () => {
    const r = diffLinks([stored('rag', 'mentions')], [classified('rag', 'cites')]);
    expect(r.toUpdate.map((l) => l.target)).toEqual(['rag']);
    expect(r.toUpdate[0]?.edgeType).toBe('cites');
  });

  it('reports update when inferenceRule changes', () => {
    const r = diffLinks(
      [stored('rag', 'cites', 'extracted', 'cites_per')],
      [classified('rag', 'cites', 'extracted', 'section_sources')],
    );
    expect(r.toUpdate.map((l) => l.target)).toEqual(['rag']);
  });

  it('reports nothing when state is identical', () => {
    const r = diffLinks(
      [stored('rag', 'cites', 'extracted', 'cites_per')],
      [classified('rag', 'cites', 'extracted', 'cites_per')],
    );
    expect(r.toInsert).toEqual([]);
    expect(r.toDelete).toEqual([]);
    expect(r.toUpdate).toEqual([]);
  });

  it('handles mixed add + remove + update + keep', () => {
    const r = diffLinks(
      [stored('keep', 'cites'), stored('remove'), stored('change', 'mentions')],
      [classified('keep', 'cites'), classified('add'), classified('change', 'cites')],
    );
    expect(r.toInsert.map((l) => l.target)).toEqual(['add']);
    expect(r.toDelete.map((l) => l.target)).toEqual(['remove']);
    expect(r.toUpdate.map((l) => l.target)).toEqual(['change']);
  });
});
