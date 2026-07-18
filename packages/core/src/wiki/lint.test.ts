import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { WikiIndex } from '../graph/index/wiki-index';
import { lintWiki } from './lint';

async function seedPage(
  store: MemoryStore,
  wikiIndex: WikiIndex,
  layer: 'concepts' | 'notes',
  slug: string,
  body: string,
  meta: Partial<{ updated: string; sources: string[]; title: string }> = {},
): Promise<void> {
  await store.writeText(`wiki/${layer}/${slug}.md`, body);
  await store.writeJSON(`wiki/${layer}/${slug}.meta.json`, {
    id: slug,
    title: meta.title ?? slug,
    type: 'concept',
    created: '2026-01-01T00:00:00.000Z',
    updated: meta.updated ?? '2026-05-01T00:00:00.000Z',
    sources: meta.sources ?? [],
    related: [],
    one_liner: '',
    word_count: body.length,
    compile_version: 1,
    edit_state: 'auto',
    last_human_edit: null,
  });
  // Upsert into WikiIndex with empty links array
  wikiIndex.upsertPage(
    {
      slug,
      path: `wiki/${layer}/${slug}.md`,
      title: meta.title ?? slug,
      type: 'concept',
      kind: null,
      contentHash: 'h',
      wordCount: body.length,
      tags: [],
      visibility: null,
      project: null,
      summary: null,
      meta: null,
    },
    [],
  );
}

describe('lintWiki', () => {
  it('returns empty findings for empty wiki', async () => {
    const store = new MemoryStore();
    const wikiIndex = WikiIndex.openInMemory();
    const report = await lintWiki(store, wikiIndex);
    expect(report.total_pages_checked).toBe(0);
    expect(report.findings).toEqual([]);
    wikiIndex.close();
  });

  it('flags missing concept when a link target has no page', async () => {
    const store = new MemoryStore();
    const wikiIndex = WikiIndex.openInMemory();
    await seedPage(store, wikiIndex, 'concepts', 'page-a', '# Page A\n\nlinks to [[page-b]]');
    // Insert a link from page-a to page-b
    wikiIndex.insertLink({
      from: 'page-a',
      to: 'page-b',
      edgeType: 'mentions',
    });
    const report = await lintWiki(store, wikiIndex);
    const missing = report.findings.filter((f) => f.kind === 'missing-concept');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.slug).toBe('page-b');
    wikiIndex.close();
  });

  it('flags orphan when no inbound links exist', async () => {
    const store = new MemoryStore();
    const wikiIndex = WikiIndex.openInMemory();
    await seedPage(store, wikiIndex, 'concepts', 'lonely', '# Lonely\n\nnothing');
    const report = await lintWiki(store, wikiIndex);
    const orphans = report.findings.filter((f) => f.kind === 'orphan');
    expect(orphans).toHaveLength(1);
    expect(orphans[0]!.slug).toBe('lonely');
    wikiIndex.close();
  });

  it('flags stale pages older than staleDays', async () => {
    const store = new MemoryStore();
    const wikiIndex = WikiIndex.openInMemory();
    const oldDate = new Date(Date.now() - 100 * 86400_000).toISOString();
    await seedPage(store, wikiIndex, 'concepts', 'old', '# Old\n\nstuff', { updated: oldDate });
    // Give the page an inbound link so it's not also flagged as orphan
    wikiIndex.insertLink({
      from: 'old',
      to: 'old',
      edgeType: 'mentions',
    });
    const report = await lintWiki(store, wikiIndex, { staleDays: 90 });
    const stale = report.findings.filter((f) => f.kind === 'stale-page');
    expect(stale).toHaveLength(1);
    expect(stale[0]!.slug).toBe('old');
    wikiIndex.close();
  });

  it('filters [[raw:abc]] and [[rawabcd]] from missing-concept', async () => {
    const store = new MemoryStore();
    const wikiIndex = WikiIndex.openInMemory();
    await seedPage(store, wikiIndex, 'concepts', 'p', '# P\n\n[[raw:abc]] [[rawabcd]] [[real-missing]]');
    for (const target of ['raw:abc', 'rawabcd', 'real-missing']) {
      wikiIndex.insertLink({
        from: 'p',
        to: target,
        edgeType: 'mentions',
      });
    }
    const report = await lintWiki(store, wikiIndex);
    const missing = report.findings.filter((f) => f.kind === 'missing-concept');
    expect(missing.map((f) => f.slug)).toEqual(['real-missing']);
    wikiIndex.close();
  });

  it('respects maxPerKind cap', async () => {
    const store = new MemoryStore();
    const wikiIndex = WikiIndex.openInMemory();
    for (let i = 0; i < 10; i++) {
      await seedPage(store, wikiIndex, 'concepts', `orphan-${i}`, `# Orphan ${i}`);
    }
    const report = await lintWiki(store, wikiIndex, { maxPerKind: 3 });
    const orphans = report.findings.filter((f) => f.kind === 'orphan');
    expect(orphans).toHaveLength(3);
    wikiIndex.close();
  });
});
