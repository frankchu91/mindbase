import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../../storage/memory_store';
import { WikiIndex } from './wiki-index';
import { reindex } from './reindex';

describe('reindex', () => {
  it('populates an empty index from a Store containing wiki notes', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/rag.md', '# RAG\n\nLinks [[llm]].');
    await store.writeJSON('wiki/notes/rag.meta.json', { title: 'RAG', type: 'concept', tags: ['retrieval'] });
    await store.writeText('wiki/notes/llm.md', '# LLM\n\nMentions [[rag]].');
    await store.writeJSON('wiki/notes/llm.meta.json', { title: 'LLM', type: 'concept' });

    const index = WikiIndex.openInMemory();
    const result = await reindex(store, index);

    expect(result.pagesProcessed).toBe(2);
    expect(result.linksWritten).toBe(2);
    expect(index.allPages().map((p) => p.slug).sort()).toEqual(['llm', 'rag']);
    expect(index.outgoingFrom('rag').map((l) => l.target_slug)).toEqual(['llm']);

    index.close();
  });

  it('is idempotent — running twice produces the same final state', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/a.md', 'See [[b]].');
    await store.writeJSON('wiki/notes/a.meta.json', { title: 'A', type: 'concept' });
    await store.writeText('wiki/notes/b.md', 'See [[a]].');
    await store.writeJSON('wiki/notes/b.meta.json', { title: 'B', type: 'concept' });

    const index = WikiIndex.openInMemory();
    await reindex(store, index);
    const after1 = JSON.stringify({ p: index.allPages(), l: index.allLinks() });
    await reindex(store, index);
    const after2 = JSON.stringify({ p: index.allPages(), l: index.allLinks() });

    expect(after2).toBe(after1);
    index.close();
  });

  it('removes pages that exist in the index but no longer in the store', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/keep.md', '# Keep');
    await store.writeJSON('wiki/notes/keep.meta.json', { title: 'Keep', type: 'concept' });

    const index = WikiIndex.openInMemory();
    // Seed a phantom page.
    index.upsertPage({
      slug: 'ghost', path: 'wiki/notes/ghost.md', title: 'Ghost',
      type: 'concept', kind: null, contentHash: 'h', wordCount: 1,
      tags: [], visibility: null, project: null, summary: null, meta: null,
    }, []);

    await reindex(store, index);
    expect(index.allPages().map((p) => p.slug).sort()).toEqual(['keep']);
    index.close();
  });

  it('handles pages without meta.json by falling back to defaults', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/orphan.md', '# Orphan\n\nNo meta sidecar.');
    // No meta.json written.

    const index = WikiIndex.openInMemory();
    await reindex(store, index);
    const page = index.getPage('orphan');
    expect(page?.title).toBe('orphan');           // fallback to slug
    expect(page?.type).toBe('concept');           // fallback default
    expect(page?.tags).toEqual([]);
    index.close();
  });

  it('skips non-.md entries and .meta.json sidecars', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/real.md', '# Real');
    await store.writeJSON('wiki/notes/real.meta.json', { title: 'Real', type: 'concept' });
    // Intruders that must be ignored.
    await store.writeText('wiki/notes/.DS_Store', 'junk');
    await store.writeText('wiki/notes/README.txt', 'not a wiki page');

    const index = WikiIndex.openInMemory();
    const result = await reindex(store, index);
    expect(result.pagesProcessed).toBe(1);
    expect(index.allPages().map((p) => p.slug)).toEqual(['real']);
    index.close();
  });

  it('populates edge_type via classifier', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/host.md',
      `# Host\n\n` +
      `Background prose mentioning [[plain]].\n\n` +
      `## Sources\n\n[[paper-abc]]\n\n` +
      `## See also\n\n[[related]]`,
    );
    await store.writeJSON('wiki/notes/host.meta.json', { title: 'Host', type: 'concept' });

    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    const byTarget = Object.fromEntries(
      index.outgoingFrom('host').map((l) => [l.target_slug, l]),
    );
    expect(byTarget['plain']?.edge_type).toBe('mentions');
    expect(byTarget['paper-abc']?.edge_type).toBe('cites');
    expect(byTarget['related']?.edge_type).toBe('elaborates');
    index.close();
  });

  it('uses page-role prior on paper-typed pages', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/the-paper.md', '# Paper\n\nWe reference [[other]] in our work.');
    await store.writeJSON('wiki/notes/the-paper.meta.json', { title: 'Paper', type: 'paper' });

    const index = WikiIndex.openInMemory();
    await reindex(store, index);
    const links = index.outgoingFrom('the-paper');
    expect(links[0]?.edge_type).toBe('cites');
    expect(links[0]?.confidence).toBe('inferred');
    index.close();
  });
});
