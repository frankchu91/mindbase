import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { WikiIndex } from '../graph/index/wiki-index';
import { reindex } from '../graph/index/reindex';
import { runAnalysis } from './insights';

async function seed(store: MemoryStore, slug: string, body: string, type = 'concept'): Promise<void> {
  await store.writeText(`wiki/notes/${slug}.md`, body);
  await store.writeJSON(`wiki/notes/${slug}.meta.json`, { title: slug, type });
}

describe('runAnalysis', () => {
  it('returns structured insights for a small wiki', async () => {
    const store = new MemoryStore();
    await seed(store, 'rag', '# RAG\nLinks [[llm]] [[embedding]]');
    await seed(store, 'llm', '# LLM\nSee [[rag]]');
    await seed(store, 'embedding', '# Embedding\nSee [[rag]]');
    await seed(store, 'orphan1', '# Orphan1\nLinks [[orphan2]]');
    await seed(store, 'orphan2', '# Orphan2\nLinks [[orphan1]]');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    const insights = await runAnalysis({ store, wikiIndex: index });
    expect(insights.communities.length).toBeGreaterThan(0);
    expect(insights.godNodes).toBeInstanceOf(Array);
    expect(insights.bridgeNodes).toBeInstanceOf(Array);
    expect(insights.orphanClusters.length).toBeGreaterThan(0);
    expect(insights.suggestions).toBeInstanceOf(Array);
    expect(typeof insights.computedAt).toBe('string');
    index.close();
  });

  it('writes results to analysis_cache so they persist', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A');
    await seed(store, 'b', '# B');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    await runAnalysis({ store, wikiIndex: index });
    const cache = index.analysisCache();
    expect(cache.get('god_nodes')).not.toBeNull();
    expect(cache.get('bridge_nodes')).not.toBeNull();
    expect(cache.get('orphan_clusters')).not.toBeNull();
    expect(cache.get('suggestions')).not.toBeNull();
    index.close();
  });

  it('persists community assignments to pages', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A\nLinks [[b]]');
    await seed(store, 'b', '# B');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    await runAnalysis({ store, wikiIndex: index });
    expect(index.getPage('a')?.community_id).toBeDefined();
    expect(index.getPage('b')?.community_id).toBeDefined();
    index.close();
  });

  it('handles empty wiki gracefully', async () => {
    const store = new MemoryStore();
    const index = WikiIndex.openInMemory();
    const insights = await runAnalysis({ store, wikiIndex: index });
    expect(insights.communities).toEqual([]);
    expect(insights.godNodes).toEqual([]);
    expect(insights.orphanClusters).toEqual([]);
    expect(insights.suggestions).toEqual([]);
    index.close();
  });

  it('contradictions only included when explicitly enabled (no LLM probe on every run)', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A\nvs [[b]]');
    await seed(store, 'b', '# B');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);
    // Seed an existing contradiction in the cache (simulating a prior probe run)
    index.contradictionCache().put({
      slugA: 'a', slugB: 'b', modelId: 'm', promptVersion: 'judge/v1',
      verdict: 'contradicts', reason: 'real conflict',
    });
    const insights = await runAnalysis({ store, wikiIndex: index });
    expect(insights.contradictions.length).toBe(1);
    expect(insights.contradictions[0]?.slugA).toBe('a');
    index.close();
  });
});
