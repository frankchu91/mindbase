import { describe, it, expect } from 'vitest';
import { SearchIndex } from './index';

describe('SearchIndex', () => {
  it('indexes documents and finds them by keyword', () => {
    const idx = new SearchIndex();
    idx.add({
      path: 'wiki/concepts/rag.md',
      title: 'Retrieval-Augmented Generation',
      body: 'RAG uses external retrieval to augment LLM context.',
      type: 'concept',
    });
    idx.add({
      path: 'wiki/concepts/mcp.md',
      title: 'Model Context Protocol',
      body: 'MCP is a protocol for tool calling.',
      type: 'concept',
    });

    const results = idx.search('retrieval');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.path).toBe('wiki/concepts/rag.md');
  });

  it('supports prefix matching', () => {
    const idx = new SearchIndex();
    idx.add({ path: 'a.md', title: 'retrieval', body: 'retrieval-augmented', type: 'concept' });
    // Prefix matching: 'retriev' → 'retrieval' (prefix=true, no fuzzy needed)
    const r = idx.search('retrieval');
    expect(r.length).toBeGreaterThan(0);
    // Fuzzy is now 0.2 (tighter) to prevent false positives with mixed-lang;
    // short prefix still works:
    const rPfx = idx.search('retrie');
    expect(rPfx.length).toBeGreaterThan(0);
  });

  it('upserts a document when adding the same path twice', () => {
    const idx = new SearchIndex();
    idx.add({ path: 'a.md', title: 'old', body: 'old body', type: 'concept' });
    idx.add({ path: 'a.md', title: 'new', body: 'new body', type: 'concept' });
    const r = idx.search('new');
    expect(r[0]?.path).toBe('a.md');
    const old = idx.search('old');
    expect(old[0]?.path).not.toBe('a.md');
  });

  it('removes a document by path', () => {
    const idx = new SearchIndex();
    idx.add({ path: 'a.md', title: 'rag', body: 'rag body', type: 'concept' });
    idx.remove('a.md');
    const r = idx.search('rag');
    expect(r).toHaveLength(0);
  });

  it('serialize and load roundtrip preserves documents', () => {
    const idx1 = new SearchIndex();
    idx1.add({ path: 'a.md', title: 'rag', body: 'retrieval', type: 'concept' });
    const json = idx1.serialize();

    const idx2 = SearchIndex.load(json);
    const r = idx2.search('retrieval');
    expect(r[0]?.path).toBe('a.md');
  });

  it('returns empty for empty query', () => {
    const idx = new SearchIndex();
    idx.add({ path: 'a.md', title: 'x', body: 'y', type: 'concept' });
    expect(idx.search('')).toEqual([]);
  });
});
