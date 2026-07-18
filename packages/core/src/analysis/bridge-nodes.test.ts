import { describe, it, expect } from 'vitest';
import type { PageGraph, PageNode } from '../graph/types';
import { detectBridgeNodes } from './bridge-nodes';

function makeGraph(adj: Record<string, string[]>): PageGraph {
  const nodes = new Map<string, PageNode>();
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const edges: PageGraph['edges'] = [];
  for (const slug of Object.keys(adj)) {
    nodes.set(slug, {
      slug, path: `wiki/notes/${slug}.md`, title: slug,
      type: 'concept', tags: [], category: 'concepts', wordCount: 0,
    });
    incoming.set(slug, []);
    outgoing.set(slug, []);
  }
  for (const [from, targets] of Object.entries(adj)) {
    for (const to of targets) {
      outgoing.get(from)!.push(to);
      incoming.get(to)!.push(from);
      edges.push({ source: from, target: to, confidence: 'extracted', broken: false, edgeType: 'mentions', inferenceRule: null });
    }
  }
  return { nodes, edges, incoming, outgoing };
}

describe('detectBridgeNodes', () => {
  it('flags a node whose neighbors are in 2+ different communities', () => {
    // a1, a2 in community 0; b1, b2 in community 1; bridge connects them
    const graph = makeGraph({
      a1: ['a2', 'bridge'],
      a2: ['a1'],
      bridge: ['a1', 'b1'],
      b1: ['b2', 'bridge'],
      b2: ['b1'],
    });
    const assignments = new Map([
      ['a1', 0], ['a2', 0],
      ['b1', 1], ['b2', 1],
      ['bridge', 0],  // arbitrary — what matters is its neighbors span communities
    ]);
    const result = detectBridgeNodes(graph, assignments);
    expect(result.find((b) => b.slug === 'bridge')).toBeDefined();
    const bridge = result.find((b) => b.slug === 'bridge')!;
    expect(bridge.communityCount).toBe(2);
    expect(bridge.communities.sort()).toEqual([0, 1]);
  });

  it('does NOT flag a node whose neighbors are all in one community', () => {
    const graph = makeGraph({
      a1: ['a2', 'a3'],
      a2: ['a1'],
      a3: ['a1'],
    });
    const assignments = new Map([['a1', 0], ['a2', 0], ['a3', 0]]);
    const result = detectBridgeNodes(graph, assignments);
    expect(result).toEqual([]);
  });

  it('sorts results by community count desc', () => {
    // Build a single node that bridges 3 communities, plus a 2-community bridge
    const graph = makeGraph({
      big_bridge: ['x', 'y', 'z'],
      x: ['big_bridge'],
      y: ['big_bridge'],
      z: ['big_bridge'],
      small_bridge: ['p', 'q'],
      p: ['small_bridge'],
      q: ['small_bridge'],
    });
    const assignments = new Map([
      ['big_bridge', 0], ['x', 1], ['y', 2], ['z', 3],
      ['small_bridge', 0], ['p', 5], ['q', 6],
    ]);
    const result = detectBridgeNodes(graph, assignments);
    expect(result[0]?.slug).toBe('big_bridge');
    expect(result[0]?.communityCount).toBe(3);
    expect(result[1]?.slug).toBe('small_bridge');
  });

  it('ignores broken edges', () => {
    const graph = makeGraph({
      a: ['b'],
      b: ['a'],
    });
    // Mark b→a edge as broken
    graph.edges[1]!.broken = true;
    const assignments = new Map([['a', 0], ['b', 1]]);
    const result = detectBridgeNodes(graph, assignments);
    expect(result.every((b) => b.communityCount >= 2)).toBe(true);
  });

  it('returns empty when assignments map is empty', () => {
    const graph = makeGraph({ a: ['b'], b: ['a'] });
    expect(detectBridgeNodes(graph, new Map())).toEqual([]);
  });
});
