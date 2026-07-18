// packages/core/src/graph/export.test.ts
import { describe, it, expect } from 'vitest';
import type { PageGraph, PageNode } from './types';
import { toJSON, toGraphML, toCypher, toHTML } from './export';

function makeNode(slug: string, overrides: Partial<PageNode> = {}): PageNode {
  return {
    slug, path: `wiki/notes/${slug}.md`, title: slug, type: 'concept',
    tags: [], category: 'concepts', wordCount: 100, ...overrides,
  };
}

function makeGraph(): PageGraph {
  const nodes = new Map([
    ['a', makeNode('a', { title: 'A', tags: ['ml'] })],
    ['b', makeNode('b', { title: 'B', tags: ['ml'] })],
  ]);
  const edges = [{ source: 'a', target: 'b', confidence: 'extracted' as const, broken: false, edgeType: 'mentions' as const, inferenceRule: null }];
  const incoming = new Map([['a', []], ['b', ['a']]]);
  const outgoing = new Map([['a', ['b']], ['b', []]]);
  return { nodes, edges, incoming, outgoing };
}

describe('graph export', () => {
  it('toJSON returns valid NetworkX node_link format', () => {
    const json = JSON.parse(toJSON(makeGraph()));
    expect(json.nodes).toHaveLength(2);
    expect(json.links).toHaveLength(1);
    expect(json.directed).toBe(false);
    expect(json.nodes[0]).toHaveProperty('id');
    expect(json.links[0]).toMatchObject({ source: 'a', target: 'b' });
  });

  it('toGraphML produces well-formed XML', () => {
    const xml = toGraphML(makeGraph());
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<graphml');
    expect(xml).toContain('<node id="a">');
    expect(xml).toContain('<edge source="a" target="b">');
  });

  it('toCypher produces MERGE statements', () => {
    const cypher = toCypher(makeGraph());
    expect(cypher).toContain('MERGE (n:Page {id: "a"})');
    expect(cypher).toContain('MERGE (a)-[:WIKILINK');
  });

  it('toHTML produces standalone HTML with embedded data', () => {
    const html = toHTML(makeGraph());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('vis-network');
    expect(html).toContain('"id":"a"');
  });

  it('excludes nodes by visibility filter', () => {
    const g = makeGraph();
    g.nodes.set('secret', makeNode('secret', { visibility: 'pii' }));
    g.edges.push({ source: 'a', target: 'secret', confidence: 'extracted', broken: false, edgeType: 'mentions', inferenceRule: null });
    const json = JSON.parse(toJSON(g, { excludeVisibility: ['pii'] }));
    expect(json.nodes.find((n: { id: string }) => n.id === 'secret')).toBeUndefined();
    expect(json.links.find((l: { target: string }) => l.target === 'secret')).toBeUndefined();
  });

  it('prefers persisted community_id over tag heuristic when present', () => {
    const nodes = new Map<string, PageNode>();
    nodes.set('a', makeNode('a', { tags: ['x'], community_id: 42 }));
    nodes.set('b', makeNode('b', { tags: ['y'], community_id: 42 }));
    const graph: PageGraph = { nodes, edges: [], incoming: new Map(), outgoing: new Map() };
    const json = JSON.parse(toJSON(graph));
    // Both nodes share community_id=42, regardless of their different tags
    const a = json.nodes.find((n: any) => n.id === 'a');
    const b = json.nodes.find((n: any) => n.id === 'b');
    expect(a.community).toBe(42);
    expect(b.community).toBe(42);
  });

  it('falls back to tag-based heuristic when no community_id is set', () => {
    const nodes = new Map<string, PageNode>();
    nodes.set('a', makeNode('a', { tags: ['x'] }));
    nodes.set('b', makeNode('b', { tags: ['y'] }));
    const graph: PageGraph = { nodes, edges: [], incoming: new Map(), outgoing: new Map() };
    const json = JSON.parse(toJSON(graph));
    // Different tags → different community ids
    const a = json.nodes.find((n: any) => n.id === 'a');
    const b = json.nodes.find((n: any) => n.id === 'b');
    expect(a.community).not.toBe(b.community);
  });
});
