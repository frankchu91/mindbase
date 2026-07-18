// packages/core/src/graph/analysis.test.ts
import { describe, it, expect } from 'vitest';
import type { PageGraph, PageNode } from './types';
import { getHubs, getOrphans, getBrokenLinks, getOrphanAdjacent, getCohesion } from './analysis';

function makeNode(slug: string, overrides: Partial<PageNode> = {}): PageNode {
  return {
    slug, path: `wiki/notes/${slug}.md`, title: slug, type: 'concept',
    tags: [], category: 'concepts', wordCount: 100, ...overrides,
  };
}

function makeGraph(nodes: PageNode[], links: Array<[string, string]>): PageGraph {
  const nodeMap = new Map(nodes.map((n) => [n.slug, n]));
  const edges = links.map(([s, t]) => ({ source: s, target: t, confidence: 'extracted' as const, broken: !nodeMap.has(t) }));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) { incoming.set(n.slug, []); outgoing.set(n.slug, []); }
  for (const [s, t] of links) {
    if (nodeMap.has(t)) {
      outgoing.get(s)!.push(t);
      incoming.get(t)!.push(s);
    }
  }
  return { nodes: nodeMap, edges, incoming, outgoing };
}

describe('graph analysis', () => {
  it('getHubs returns top pages by incoming count', () => {
    const g = makeGraph(
      [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')],
      [['a', 'd'], ['b', 'd'], ['c', 'd'], ['a', 'b']],
    );
    const hubs = getHubs(g, 2);
    expect(hubs).toHaveLength(2);
    expect(hubs[0]?.slug).toBe('d');
    expect(hubs[0]?.incoming).toBe(3);
  });

  it('getHubs marks role as connector if outgoing > 5', () => {
    const targets = ['t1','t2','t3','t4','t5','t6'];
    const g = makeGraph(
      [makeNode('h'), ...targets.map((t) => makeNode(t)), makeNode('s1'), makeNode('s2')],
      [
        ['s1', 'h'], ['s2', 'h'],
        ...targets.map((t) => ['h', t] as [string, string]),
      ],
    );
    const hubs = getHubs(g, 5);
    const h = hubs.find((x) => x.slug === 'h');
    expect(h?.role).toBe('connector');
  });

  it('getHubs marks role as sink if outgoing low', () => {
    const g = makeGraph(
      [makeNode('h'), makeNode('a'), makeNode('b')],
      [['a', 'h'], ['b', 'h']],
    );
    const hubs = getHubs(g, 5);
    const h = hubs.find((x) => x.slug === 'h');
    expect(h?.role).toBe('sink');
  });

  it('getOrphans returns pages with no incoming links', () => {
    const g = makeGraph(
      [makeNode('a'), makeNode('b'), makeNode('c')],
      [['a', 'b']],
    );
    expect(getOrphans(g)).toEqual(expect.arrayContaining(['a', 'c']));
    expect(getOrphans(g)).not.toContain('b');
  });

  it('getBrokenLinks returns edges to non-existent pages', () => {
    const g = makeGraph([makeNode('a')], [['a', 'missing']]);
    const broken = getBrokenLinks(g);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toEqual({ source: 'a', target: 'missing' });
  });

  it('getOrphanAdjacent finds pages linked from hubs but with no outgoing', () => {
    // h is a hub (incoming=2). dead is linked from h but has no outgoing.
    const g = makeGraph(
      [makeNode('h'), makeNode('a'), makeNode('b'), makeNode('dead')],
      [['a', 'h'], ['b', 'h'], ['h', 'dead']],
    );
    const adj = getOrphanAdjacent(g);
    expect(adj.find((x) => x.slug === 'dead')).toBeDefined();
  });

  it('getCohesion computes cohesion score per tag', () => {
    const g = makeGraph(
      [
        makeNode('a', { tags: ['ml'] }),
        makeNode('b', { tags: ['ml'] }),
        makeNode('c', { tags: ['ml'] }),
      ],
      [['a', 'b'], ['b', 'c']],
    );
    const cohesion = getCohesion(g);
    const ml = [...cohesion.cohesive, ...cohesion.fragmented].find((c) => c.tag === 'ml');
    expect(ml?.pageCount).toBe(3);
    // 2 actual links / 3 possible = 0.667
    expect(ml?.score).toBeCloseTo(2 / 3, 2);
  });
});
