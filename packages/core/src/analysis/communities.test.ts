import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { WikiIndex } from '../graph/index/wiki-index';
import { reindex } from '../graph/index/reindex';
import { detectCommunities, persistCommunities } from './communities';

async function seedTwoClusters(): Promise<{ index: WikiIndex }> {
  // Cluster A: a1↔a2↔a3
  // Cluster B: b1↔b2↔b3
  // Single weak edge a1→b1 to keep it one graph
  const store = new MemoryStore();
  async function seed(slug: string, body: string) {
    await store.writeText(`wiki/notes/${slug}.md`, body);
    await store.writeJSON(`wiki/notes/${slug}.meta.json`, { title: slug, type: 'concept' });
  }
  await seed('a1', '# A1\nLinks [[a2]] [[a3]] [[b1]]');
  await seed('a2', '# A2\nLinks [[a1]] [[a3]]');
  await seed('a3', '# A3\nLinks [[a1]] [[a2]]');
  await seed('b1', '# B1\nLinks [[b2]] [[b3]]');
  await seed('b2', '# B2\nLinks [[b1]] [[b3]]');
  await seed('b3', '# B3\nLinks [[b1]] [[b2]]');
  const index = WikiIndex.openInMemory();
  await reindex(store, index);
  return { index };
}

describe('detectCommunities', () => {
  it('returns an assignment for every node', async () => {
    const { index } = await seedTwoClusters();
    const graph = index.buildGraph();
    const result = detectCommunities(graph);
    expect(result.assignments.size).toBe(graph.nodes.size);
    index.close();
  });

  it('puts strongly-connected cluster A in the same community', async () => {
    const { index } = await seedTwoClusters();
    const graph = index.buildGraph();
    const { assignments } = detectCommunities(graph);
    expect(assignments.get('a1')).toBe(assignments.get('a2'));
    expect(assignments.get('a2')).toBe(assignments.get('a3'));
    expect(assignments.get('b1')).toBe(assignments.get('b2'));
    expect(assignments.get('b2')).toBe(assignments.get('b3'));
    index.close();
  });

  it('assigns cluster A and cluster B to different communities', async () => {
    const { index } = await seedTwoClusters();
    const graph = index.buildGraph();
    const { assignments } = detectCommunities(graph);
    // v4+ graph node ids are project-namespaced ("default/<slug>").
    expect(assignments.get('default/a1')).toBeDefined();
    expect(assignments.get('default/b1')).toBeDefined();
    expect(assignments.get('default/a1')).not.toBe(assignments.get('default/b1'));
    index.close();
  });

  it('summaries include id, size, and a label sourced from the top slug', async () => {
    const { index } = await seedTwoClusters();
    const graph = index.buildGraph();
    const { summaries } = detectCommunities(graph);
    expect(summaries.length).toBeGreaterThanOrEqual(2);
    for (const s of summaries) {
      expect(typeof s.id).toBe('number');
      expect(s.size).toBeGreaterThan(0);
      expect(typeof s.label).toBe('string');
    }
    index.close();
  });

  it('returns empty result for empty graph', () => {
    const index = WikiIndex.openInMemory();
    const result = detectCommunities(index.buildGraph());
    expect(result.assignments.size).toBe(0);
    expect(result.summaries).toEqual([]);
    index.close();
  });
});

describe('persistCommunities', () => {
  it('writes community_id to pages and rows to communities table', async () => {
    const { index } = await seedTwoClusters();
    const graph = index.buildGraph();
    const result = detectCommunities(graph);
    persistCommunities(index, result);

    const a1 = index.getPage('a1');
    const a2 = index.getPage('a2');
    expect(a1?.community_id).toBeDefined();
    expect(a1?.community_id).toBe(a2?.community_id);

    // communities table should have one row per distinct community id
    const distinct = new Set(result.assignments.values()).size;
    const communities = index.listCommunities();
    expect(communities.length).toBe(distinct);
    index.close();
  });

  it('overwrites existing community assignments on re-run', async () => {
    const { index } = await seedTwoClusters();
    const graph = index.buildGraph();

    const firstResult = detectCommunities(graph);
    persistCommunities(index, firstResult);
    const firstCount = index.listCommunities().length;

    persistCommunities(index, detectCommunities(graph));
    const secondCount = index.listCommunities().length;

    expect(secondCount).toBe(firstCount);
    expect(secondCount).toBe(new Set(firstResult.assignments.values()).size);
    index.close();
  });
});
