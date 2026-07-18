import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WikiIndex, type PageRow } from './wiki-index';
import type { ClassifiedLink } from './classify-edges';

function mentionLink(target: string, confidence: ClassifiedLink['confidence'] = 'extracted'): ClassifiedLink {
  return { target, confidence, contextSnippet: '', section: null, edgeType: 'mentions', inferenceRule: null };
}

describe('WikiIndex', () => {
  let index: WikiIndex;

  beforeEach(() => {
    index = WikiIndex.openInMemory();
  });
  afterEach(() => {
    index.close();
  });

  it('opens cleanly on an empty in-memory DB', () => {
    expect(index.allPages()).toEqual([]);
    expect(index.allLinks()).toEqual([]);
  });

  it('upserts a page and reads it back', () => {
    index.upsertPage({
      slug: 'rag', path: 'wiki/notes/rag.md', title: 'RAG',
      type: 'concept', kind: null, contentHash: 'abc', wordCount: 42,
      tags: ['retrieval'], visibility: null, project: null, summary: null,
      meta: { foo: 'bar' },
    }, []);
    const row = index.getPage('rag');
    expect(row?.title).toBe('RAG');
    expect(row?.tags).toEqual(['retrieval']);
  });

  it('upserting a page with links inserts them and bumps inbound_count', () => {
    index.upsertPage({
      slug: 'llm', path: 'wiki/notes/llm.md', title: 'LLM',
      type: 'concept', kind: null, contentHash: 'h-llm', wordCount: 10,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, []);
    index.upsertPage({
      slug: 'rag', path: 'wiki/notes/rag.md', title: 'RAG',
      type: 'concept', kind: null, contentHash: 'h-rag', wordCount: 20,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [
      mentionLink('llm'),
    ]);
    expect(index.outgoingFrom('rag').map((l) => l.target_slug)).toEqual(['llm']);
    expect(index.incomingTo('llm').map((l) => l.source_slug)).toEqual(['rag']);
    expect(index.getPage('llm')?.inbound_count).toBe(1);
    expect(index.getPage('rag')?.outbound_count).toBe(1);
  });

  it('re-upserting a page diffs links — removes old, keeps same, adds new', () => {
    index.upsertPage({
      slug: 'a', path: 'wiki/notes/a.md', title: 'A',
      type: 'concept', kind: null, contentHash: 'h', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [
      mentionLink('b'),
      mentionLink('c'),
    ]);
    expect(index.outgoingFrom('a').map((l) => l.target_slug).sort()).toEqual(['b', 'c']);

    // Re-upsert with one removed and one added.
    index.upsertPage({
      slug: 'a', path: 'wiki/notes/a.md', title: 'A',
      type: 'concept', kind: null, contentHash: 'h2', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [
      mentionLink('b'),
      mentionLink('d'),
    ]);
    expect(index.outgoingFrom('a').map((l) => l.target_slug).sort()).toEqual(['b', 'd']);
  });

  it('deletePage removes the page and all its outbound links', () => {
    index.upsertPage({
      slug: 'a', path: 'wiki/notes/a.md', title: 'A',
      type: 'concept', kind: null, contentHash: 'h', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [mentionLink('b')]);
    expect(index.outgoingFrom('a')).toHaveLength(1);
    index.deletePage('a');
    expect(index.getPage('a')).toBeNull();
    expect(index.outgoingFrom('a')).toEqual([]);
  });

  it('renamePage updates pages.slug and rewrites links pointing to or from it', () => {
    index.upsertPage({
      slug: 'old', path: 'wiki/notes/old.md', title: 'Old',
      type: 'concept', kind: null, contentHash: 'h', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, []);
    index.upsertPage({
      slug: 'caller', path: 'wiki/notes/caller.md', title: 'Caller',
      type: 'concept', kind: null, contentHash: 'h2', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [mentionLink('old')]);

    index.renamePage('old', 'new', 'wiki/notes/new.md');
    expect(index.getPage('old')).toBeNull();
    expect(index.getPage('new')).not.toBeNull();
    expect(index.incomingTo('new').map((l) => l.source_slug)).toEqual(['caller']);
  });

  it('outgoingFrom returns broken-link entries (target page does not exist)', () => {
    index.upsertPage({
      slug: 'a', path: 'wiki/notes/a.md', title: 'A',
      type: 'concept', kind: null, contentHash: 'h', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [mentionLink('nonexistent')]);
    const outgoing = index.outgoingFrom('a');
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]?.target_slug).toBe('nonexistent');
  });

  it('hasUntypedLinks returns true when any link has Phase-1 defaults', () => {
    expect(index.hasUntypedLinks()).toBe(false);  // empty index
    index.upsertPage({
      slug: 'a', path: 'wiki/notes/a.md', title: 'A',
      type: 'concept', kind: null, contentHash: 'h', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [
      { target: 'b', confidence: 'extracted', contextSnippet: '', section: null, edgeType: 'mentions', inferenceRule: null },
    ]);
    expect(index.hasUntypedLinks()).toBe(true);   // 'mentions' + NULL rule = needs backfill

    // After upgrading to a typed link, hasUntypedLinks should flip false.
    index.upsertPage({
      slug: 'a', path: 'wiki/notes/a.md', title: 'A',
      type: 'concept', kind: null, contentHash: 'h2', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [
      { target: 'b', confidence: 'extracted', contextSnippet: '', section: 'Sources', edgeType: 'cites', inferenceRule: 'section_sources' },
    ]);
    expect(index.hasUntypedLinks()).toBe(false);
  });

  it('persists edge_type and inference_rule from ClassifiedLink', () => {
    index.upsertPage({
      slug: 'a', path: 'wiki/notes/a.md', title: 'A',
      type: 'concept', kind: null, contentHash: 'h', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [
      { target: 'b', confidence: 'extracted', contextSnippet: '', section: null, edgeType: 'cites', inferenceRule: 'cites_per' },
      { target: 'c', confidence: 'inferred', contextSnippet: '', section: null, edgeType: 'is_a', inferenceRule: 'is_a_kind' },
    ]);
    const out = index.outgoingFrom('a');
    const byTarget = Object.fromEntries(out.map((l) => [l.target_slug, l]));
    expect(byTarget['b']?.edge_type).toBe('cites');
    expect(byTarget['b']?.inference_rule).toBe('cites_per');
    expect(byTarget['c']?.edge_type).toBe('is_a');
    expect(byTarget['c']?.confidence).toBe('inferred');
  });

  it('auditLog returns a writer bound to the same database', () => {
    const audit = index.auditLog();
    const id = audit.startAudit({
      rawId: 'raw-1',
      trigger: 'ingest',
      model: 'm',
      promptVersion: 'v1',
      contextSlugs: [],
    });
    expect(id).toBeGreaterThan(0);
    const entry = audit.getById(id);
    expect(entry?.rawId).toBe('raw-1');
  });

  it('analysisCache + contradictionCache share the same db connection', () => {
    const ac = index.analysisCache();
    ac.put('god_nodes', { slugs: ['x'] });
    expect(index.analysisCache().get<{ slugs: string[] }>('god_nodes')?.payload.slugs).toEqual(['x']);

    const cc = index.contradictionCache();
    cc.put({ slugA: 'a', slugB: 'b', modelId: 'm', promptVersion: 'v', verdict: 'contradicts', reason: 'r' });
    expect(index.contradictionCache().get('a', 'b', 'm', 'v')?.verdict).toBe('contradicts');
  });

  it('analysisCache() returns the same instance on every call', () => {
    expect(index.analysisCache()).toBe(index.analysisCache());
  });

  it('contradictionCache() returns the same instance on every call', () => {
    expect(index.contradictionCache()).toBe(index.contradictionCache());
  });

  it('insertLink persists a typed edge between two pages', () => {
    // Seed two pages so the FK semantics make sense (links don't enforce FKs but real pages help test reads)
    index.upsertPage({ slug: 'a', path: 'wiki/notes/a.md', title: 'A', type: 'concept', kind: null, contentHash: 'h', wordCount: 0, tags: [], visibility: null, project: null, summary: null, meta: null }, []);
    index.upsertPage({ slug: 'b', path: 'wiki/notes/b.md', title: 'B', type: 'concept', kind: null, contentHash: 'h', wordCount: 0, tags: [], visibility: null, project: null, summary: null, meta: null }, []);

    index.insertLink({ from: 'a', to: 'b', edgeType: 'mentions', reason: 'test' });

    // Listing outgoing edges should now include a→b
    const out = index.outgoingFrom('a');
    expect(out.length).toBeGreaterThan(0);
    expect(out.find((l) => l.target_slug === 'b' && l.edge_type === 'mentions')).toBeDefined();
  });

  it('insertLink with the same (from, to, edge_type) twice is idempotent', () => {
    index.upsertPage({ slug: 'a', path: 'wiki/notes/a.md', title: 'A', type: 'concept', kind: null, contentHash: 'h', wordCount: 0, tags: [], visibility: null, project: null, summary: null, meta: null }, []);
    index.upsertPage({ slug: 'b', path: 'wiki/notes/b.md', title: 'B', type: 'concept', kind: null, contentHash: 'h', wordCount: 0, tags: [], visibility: null, project: null, summary: null, meta: null }, []);
    index.insertLink({ from: 'a', to: 'b', edgeType: 'mentions', reason: 'first' });
    index.insertLink({ from: 'a', to: 'b', edgeType: 'mentions', reason: 'second' });
    const out = index.outgoingFrom('a').filter((l) => l.target_slug === 'b' && l.edge_type === 'mentions');
    expect(out).toHaveLength(1); // unique constraint dedupes
  });
});

import { MemoryStore } from '../../storage/memory_store';
import { buildGraph } from '../builder';

describe('WikiIndex.buildGraph parity with legacy buildGraph(store)', () => {
  it('produces nodes and edges identical in shape to buildGraph(store)', async () => {
    // Seed the same two pages into BOTH a MemoryStore and a WikiIndex.
    const store = new MemoryStore();
    await store.writeText('wiki/notes/rag.md', '# RAG\n\nLinks [[llm]] and [[hallucination]] ^[inferred].');
    await store.writeJSON('wiki/notes/rag.meta.json', { title: 'RAG', type: 'concept' });
    await store.writeText('wiki/notes/llm.md', '# LLM\n\nSee [[rag]].');
    await store.writeJSON('wiki/notes/llm.meta.json', { title: 'LLM', type: 'concept' });

    const legacy = await buildGraph(store);

    const index = WikiIndex.openInMemory();
    index.upsertPage({
      slug: 'rag', path: 'wiki/notes/rag.md', title: 'RAG',
      type: 'concept', kind: null, contentHash: 'h-rag', wordCount: 7,
      tags: [], visibility: null, project: null, summary: null, meta: { title: 'RAG', type: 'concept' },
    }, [
      mentionLink('llm', 'inferred'),
      mentionLink('hallucination', 'inferred'),
    ]);
    index.upsertPage({
      slug: 'llm', path: 'wiki/notes/llm.md', title: 'LLM',
      type: 'concept', kind: null, contentHash: 'h-llm', wordCount: 4,
      tags: [], visibility: null, project: null, summary: null, meta: { title: 'LLM', type: 'concept' },
    }, [
      mentionLink('rag'),
    ]);

    const fromIndex = index.buildGraph();

    // v4+ namespaces node ids by project ("default/<slug>" here); the legacy
    // builder emits bare slugs. Strip the prefix before comparing shape.
    const bare = (id: string) => id.replace(/^default\//, '');
    // Same node slugs
    expect([...fromIndex.nodes.keys()].map(bare).sort()).toEqual([...legacy.nodes.keys()].sort());
    // Same edge tuples (source → target with confidence)
    const tup = (e: { source: string; target: string; confidence: string }) =>
      `${bare(e.source)}->${bare(e.target)}:${e.confidence}`;
    expect(fromIndex.edges.map(tup).sort()).toEqual(legacy.edges.map(tup).sort());
    // Same broken-link signal
    const brokenIdx = fromIndex.edges.filter((e) => e.broken).map(tup).sort();
    const brokenLeg = legacy.edges.filter((e) => e.broken).map(tup).sort();
    expect(brokenIdx).toEqual(brokenLeg);

    index.close();
  });
});
