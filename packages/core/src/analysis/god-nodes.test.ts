import { describe, it, expect } from 'vitest';
import type { PageGraph, PageNode } from '../graph/types';
import { detectGodNodes, p99InboundThreshold } from './god-nodes';

function makeGraph(nodes: Array<{ slug: string; inbound: number }>): PageGraph {
  const ns = new Map<string, PageNode>();
  const incoming = new Map<string, string[]>();
  for (const n of nodes) {
    ns.set(n.slug, {
      slug: n.slug, path: `wiki/notes/${n.slug}.md`, title: n.slug,
      type: 'concept', tags: [], category: 'concepts', wordCount: 0,
    });
    incoming.set(n.slug, new Array(n.inbound).fill('').map((_, i) => `src${i}`));
  }
  return { nodes: ns, edges: [], incoming, outgoing: new Map() };
}

describe('p99InboundThreshold', () => {
  it('returns Infinity for empty graph', () => {
    expect(p99InboundThreshold([])).toBe(Infinity);
  });

  it('returns the maximum value when the graph is tiny', () => {
    expect(p99InboundThreshold([1, 2, 3, 4, 5])).toBe(5);
  });

  it('locates p99 on a larger distribution', () => {
    const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100];
    expect(p99InboundThreshold(counts)).toBe(100);
  });
});

describe('detectGodNodes', () => {
  it('returns empty for graph with no nodes above threshold', () => {
    const g = makeGraph([
      { slug: 'a', inbound: 1 },
      { slug: 'b', inbound: 2 },
      { slug: 'c', inbound: 3 },
    ]);
    const result = detectGodNodes(g);
    // p99 of [1,2,3] is 3; only c has inbound >= 3
    expect(result.threshold).toBe(3);
    expect(result.nodes.map((n) => n.slug)).toEqual(['c']);
  });

  it('flags nodes with inbound_count >= p99', () => {
    const arr: Array<{ slug: string; inbound: number }> = [];
    for (let i = 0; i < 100; i++) arr.push({ slug: `p${i}`, inbound: 1 });
    arr.push({ slug: 'hub', inbound: 50 });
    const g = makeGraph(arr);
    const result = detectGodNodes(g);
    expect(result.nodes.map((n) => n.slug)).toContain('hub');
  });

  it('each node entry includes inbound_count + title', () => {
    const g = makeGraph([{ slug: 'rag', inbound: 5 }]);
    const result = detectGodNodes(g);
    expect(result.nodes[0]?.slug).toBe('rag');
    expect(result.nodes[0]?.title).toBe('rag');
    expect(result.nodes[0]?.inboundCount).toBe(5);
  });
});
