// packages/core/src/graph/builder.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { buildGraph } from './builder';

describe('buildGraph', () => {
  let store: MemoryStore;
  beforeEach(() => { store = new MemoryStore(); });

  async function seedPage(slug: string, body: string, meta: Record<string, unknown>) {
    await store.writeText(`wiki/notes/${slug}.md`, body);
    await store.writeJSON(`wiki/notes/${slug}.meta.json`, {
      id: `note-${slug}`,
      type: 'concept',
      title: meta.title ?? slug,
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-01T00:00:00Z',
      sources: [],
      related: [],
      one_liner: meta.one_liner ?? '',
      word_count: body.split(/\s+/).length,
      compile_version: 1,
      edit_state: 'auto',
      last_human_edit: null,
      ...meta,
    });
  }

  it('returns empty graph when no pages', async () => {
    const g = await buildGraph(store);
    expect(g.nodes.size).toBe(0);
    expect(g.edges).toEqual([]);
  });

  it('builds nodes from wiki/notes', async () => {
    await seedPage('rag', '# RAG\n\nRetrieval-augmented generation.', { title: 'RAG' });
    await seedPage('llm', '# LLM\n\nLarge language model.', { title: 'LLM' });
    const g = await buildGraph(store);
    expect(g.nodes.size).toBe(2);
    expect(g.nodes.get('rag')?.title).toBe('RAG');
    expect(g.nodes.get('llm')?.title).toBe('LLM');
  });

  it('extracts wikilinks as edges', async () => {
    await seedPage('rag', '# RAG\n\nUses [[LLM]] models.', { title: 'RAG' });
    await seedPage('llm', '# LLM\n\nLarge language model.', { title: 'LLM' });
    const g = await buildGraph(store);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ source: 'rag', target: 'llm', broken: false });
  });

  it('marks edges to non-existent pages as broken', async () => {
    await seedPage('rag', '# RAG\n\nLinks to [[NonExistent]].', { title: 'RAG' });
    const g = await buildGraph(store);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]?.broken).toBe(true);
  });

  it('detects inferred and ambiguous markers', async () => {
    await seedPage(
      'rag',
      '# RAG\n\nRelated to [[LLM]] ^[inferred]\n\nMaybe like [[Vector DB]] ^[ambiguous]',
      { title: 'RAG' },
    );
    await seedPage('llm', '# LLM', { title: 'LLM' });
    await seedPage('vector-db', '# Vector DB', { title: 'Vector DB' });
    const g = await buildGraph(store);
    const llmEdge = g.edges.find((e) => e.target === 'llm');
    const vdbEdge = g.edges.find((e) => e.target === 'vector-db');
    expect(llmEdge?.confidence).toBe('inferred');
    expect(vdbEdge?.confidence).toBe('ambiguous');
  });

  it('builds incoming and outgoing index maps', async () => {
    await seedPage('a', '# A\n\nLinks to [[B]] and [[C]].', { title: 'A' });
    await seedPage('b', '# B\n\nLinks to [[C]].', { title: 'B' });
    await seedPage('c', '# C', { title: 'C' });
    const g = await buildGraph(store);
    expect(g.outgoing.get('a')).toEqual(expect.arrayContaining(['b', 'c']));
    expect(g.incoming.get('c')).toEqual(expect.arrayContaining(['a', 'b']));
    expect(g.incoming.get('a') ?? []).toEqual([]);
  });
});
