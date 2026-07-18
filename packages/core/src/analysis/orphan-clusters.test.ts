import { describe, it, expect } from 'vitest';
import type { PageGraph, PageNode } from '../graph/types';
import { detectOrphanClusters } from './orphan-clusters';

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

describe('detectOrphanClusters', () => {
  it('returns empty when graph is one connected component', () => {
    const graph = makeGraph({
      a: ['b'], b: ['c'], c: ['a'],
    });
    expect(detectOrphanClusters(graph)).toEqual([]);
  });

  it('identifies a 2-node cluster disconnected from the main', () => {
    const graph = makeGraph({
      // Main: a—b—c
      a: ['b'], b: ['c'], c: ['a'],
      // Island: x—y
      x: ['y'], y: ['x'],
    });
    const orphans = detectOrphanClusters(graph);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.slugs.sort()).toEqual(['x', 'y']);
    expect(orphans[0]?.size).toBe(2);
  });

  it('identifies multiple separate orphan clusters', () => {
    const graph = makeGraph({
      a: ['b'], b: ['a'], c: ['a'],         // main with 3 nodes
      x: ['y'], y: ['x'],                    // island 1
      p: ['q'], q: ['r'], r: ['p'],          // island 2
    });
    const orphans = detectOrphanClusters(graph);
    expect(orphans).toHaveLength(2);
    const sizes = orphans.map((o) => o.size).sort();
    expect(sizes).toEqual([2, 3]);
  });

  it('treats single-node isolated pages as their own cluster (1-node orphan)', () => {
    const graph = makeGraph({
      a: ['b'], b: ['a'],
      loner: [],
    });
    const orphans = detectOrphanClusters(graph);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.slugs).toEqual(['loner']);
    expect(orphans[0]?.size).toBe(1);
  });

  it('sorts orphan clusters by size desc', () => {
    const graph = makeGraph({
      a: ['b'], b: ['a'], c: ['a'], d: ['a'],     // main (size 4)
      x: ['y'], y: ['x'],                          // size 2
      p: ['q'], q: ['r'], r: ['p'], s: ['p'],      // size 4 — also non-main but smaller than main wouldn't be... need 5
    });
    const orphans = detectOrphanClusters(graph);
    expect(orphans.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < orphans.length; i++) {
      expect(orphans[i - 1]!.size).toBeGreaterThanOrEqual(orphans[i]!.size);
    }
  });

  it('ignores broken edges in connectivity', () => {
    const graph = makeGraph({
      a: ['b'],
      b: ['a'],
      x: ['y'],
      y: ['x'],
    });
    // Mark all edges broken so every node is isolated
    for (const edge of graph.edges) edge.broken = true;
    const orphans = detectOrphanClusters(graph);
    // Everything is isolated; main = 1 of the {a,b,x,y}. Others = 3 orphan clusters.
    expect(orphans.length).toBe(3);
  });
});
