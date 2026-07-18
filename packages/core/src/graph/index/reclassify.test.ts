import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../../storage/memory_store';
import { WikiIndex } from './wiki-index';
import { reclassify } from './reclassify';

describe('reclassify', () => {
  it('updates existing mentions edges to their classified type', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/host.md',
      `# Host\n\n` +
      `Background mentioning [[plain]].\n\n` +
      `## Sources\n\n[[paper]]`,
    );
    await store.writeJSON('wiki/notes/host.meta.json', { title: 'Host', type: 'concept' });

    const index = WikiIndex.openInMemory();
    // Simulate a Phase-1 state: links exist with edge_type='mentions'.
    index.upsertPage({
      slug: 'host', path: 'wiki/notes/host.md', title: 'Host',
      type: 'concept', kind: null, contentHash: 'h', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [
      { target: 'plain', confidence: 'extracted', contextSnippet: '', section: null, edgeType: 'mentions', inferenceRule: null },
      { target: 'paper', confidence: 'extracted', contextSnippet: '', section: null, edgeType: 'mentions', inferenceRule: null },
    ]);

    const result = await reclassify(store, index);
    expect(result.pagesProcessed).toBe(1);
    expect(result.linksUpdated).toBeGreaterThan(0);

    const byTarget = Object.fromEntries(
      index.outgoingFrom('host').map((l) => [l.target_slug, l]),
    );
    expect(byTarget['paper']?.edge_type).toBe('cites');
    expect(byTarget['plain']?.edge_type).toBe('mentions');     // unchanged but re-confirmed
    index.close();
  });

  it('is idempotent — running twice yields same state', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/a.md', '# A\n\n## Sources\n\n[[b]]');
    await store.writeJSON('wiki/notes/a.meta.json', { title: 'A', type: 'concept' });

    const index = WikiIndex.openInMemory();
    index.upsertPage({
      slug: 'a', path: 'wiki/notes/a.md', title: 'A',
      type: 'concept', kind: null, contentHash: 'h', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [
      { target: 'b', confidence: 'extracted', contextSnippet: '', section: null, edgeType: 'mentions', inferenceRule: null },
    ]);

    await reclassify(store, index);
    const after1 = index.outgoingFrom('a').map((l) => `${l.target_slug}:${l.edge_type}:${l.inference_rule}`);
    await reclassify(store, index);
    const after2 = index.outgoingFrom('a').map((l) => `${l.target_slug}:${l.edge_type}:${l.inference_rule}`);
    expect(after2).toEqual(after1);
    index.close();
  });

  it('skips pages whose .md cannot be read (defensive)', async () => {
    const store = new MemoryStore();
    // No .md written for this slug.

    const index = WikiIndex.openInMemory();
    index.upsertPage({
      slug: 'ghost', path: 'wiki/notes/ghost.md', title: 'Ghost',
      type: 'concept', kind: null, contentHash: 'h', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, [
      { target: 'x', confidence: 'extracted', contextSnippet: '', section: null, edgeType: 'mentions', inferenceRule: null },
    ]);

    const result = await reclassify(store, index);
    expect(result.pagesProcessed).toBe(0);   // skipped
    index.close();
  });
});
