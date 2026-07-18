// packages/core/src/wiki/index-md.test.ts
import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { rebuildIndex, indexUpsertConcept } from './index-md';

async function seedConcept(store: MemoryStore, slug: string, title: string, oneLiner = '', sources: string[] = []): Promise<void> {
  await store.writeText(`wiki/concepts/${slug}.md`, `# ${title}\n`);
  await store.writeJSON(`wiki/concepts/${slug}.meta.json`, {
    id: slug, title, type: 'concept',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-05-01T00:00:00.000Z',
    sources, related: [], one_liner: oneLiner,
    word_count: 5, compile_version: 1, edit_state: 'auto', last_human_edit: null,
  });
}

async function seedDraft(store: MemoryStore, slug: string, title: string): Promise<void> {
  await store.writeText(`wiki/notes/${slug}.md`, `# ${title}\n`);
  await store.writeJSON(`wiki/notes/${slug}.meta.json`, {
    id: slug, title, type: 'concept',
    created: '2026-01-01T00:00:00.000Z', updated: '2026-05-01T00:00:00.000Z',
    sources: [], related: [], one_liner: '', word_count: 5,
    compile_version: 0, edit_state: 'human_touched', last_human_edit: '2026-05-01T00:00:00.000Z',
    kind: 'note', created_via: 'web',
  });
}

describe('rebuildIndex', () => {
  it('writes a placeholder Concepts section for empty wiki', async () => {
    const store = new MemoryStore();
    const result = await rebuildIndex(store);
    expect(result.totalPages).toBe(0);
    const body = await store.readText('wiki/INDEX.md');
    expect(body).toContain('## Concepts — LLM-maintained (0)');
    expect(body).toContain('_(no concept pages yet');
    expect(body).toContain('## Drafts — user-written (0)');
    expect(body).toContain('## Sources — raw imports (0)');
  });

  it('categorizes pages with correct counts', async () => {
    const store = new MemoryStore();
    await seedConcept(store, 'foo', 'Foo Concept', 'about foo', ['abc']);
    await seedConcept(store, 'bar', 'Bar Concept', 'about bar', ['abc', 'def']);
    await seedDraft(store, 'draft-x', 'Draft X');
    const result = await rebuildIndex(store);
    expect(result.concepts).toBe(2);
    expect(result.drafts).toBe(1);
    const body = await store.readText('wiki/INDEX.md');
    expect(body).toContain('## Concepts — LLM-maintained (2)');
    expect(body).toContain('## Drafts — user-written (1)');
    expect(body).toContain('[Foo Concept](wiki/concepts/foo.md)');
    expect(body).toContain('[Bar Concept](wiki/concepts/bar.md)');
    expect(body).toContain('about foo');
    expect(body).toContain('_(1 source)_');
    expect(body).toContain('_(2 sources)_');
  });

  it('sorts entries alphabetically within category', async () => {
    const store = new MemoryStore();
    await seedConcept(store, 'zebra', 'Zebra');
    await seedConcept(store, 'apple', 'Apple');
    await seedConcept(store, 'mango', 'Mango');
    await rebuildIndex(store);
    const body = await store.readText('wiki/INDEX.md');
    const appleIdx = body.indexOf('[Apple]');
    const mangoIdx = body.indexOf('[Mango]');
    const zebraIdx = body.indexOf('[Zebra]');
    expect(appleIdx).toBeLessThan(mangoIdx);
    expect(mangoIdx).toBeLessThan(zebraIdx);
  });

  it('is idempotent (re-run produces same content modulo timestamp)', async () => {
    const store = new MemoryStore();
    await seedConcept(store, 'foo', 'Foo');
    await rebuildIndex(store);
    const body1 = (await store.readText('wiki/INDEX.md')).replace(/_Last regenerated:.*_/, '');
    await rebuildIndex(store);
    const body2 = (await store.readText('wiki/INDEX.md')).replace(/_Last regenerated:.*_/, '');
    expect(body1).toBe(body2);
  });
});

describe('indexUpsertConcept', () => {
  it('adds a new entry to Concepts section', async () => {
    const store = new MemoryStore();
    await rebuildIndex(store);
    await indexUpsertConcept(store, 'new-page', 'New Page', 'a fresh concept', 1);
    const body = await store.readText('wiki/INDEX.md');
    expect(body).toContain('[New Page](wiki/concepts/new-page.md)');
    expect(body).toContain('a fresh concept');
    expect(body).toContain('## Concepts — LLM-maintained (1)');
  });

  it('is idempotent (already present → no change)', async () => {
    const store = new MemoryStore();
    await rebuildIndex(store);
    await indexUpsertConcept(store, 'foo', 'Foo', '', 0);
    const before = await store.readText('wiki/INDEX.md');
    await indexUpsertConcept(store, 'foo', 'Foo', '', 0);
    const after = await store.readText('wiki/INDEX.md');
    expect(after).toBe(before);
  });

  it('rebuilds index when INDEX.md is missing', async () => {
    const store = new MemoryStore();
    await seedConcept(store, 'pre-existing', 'Pre-existing');
    // No INDEX.md yet — should bootstrap via rebuildIndex
    await indexUpsertConcept(store, 'pre-existing', 'Pre-existing', 'hi', 0);
    const body = await store.readText('wiki/INDEX.md');
    expect(body).toContain('[Pre-existing]');
    // Verify it created the INDEX.md file
    expect(body).toContain('## Concepts — LLM-maintained');
  });

  it('removes placeholder line on first real entry', async () => {
    const store = new MemoryStore();
    await rebuildIndex(store);
    const initial = await store.readText('wiki/INDEX.md');
    expect(initial).toContain('_(no concept pages yet');
    await indexUpsertConcept(store, 'first', 'First', '', 0);
    const after = await store.readText('wiki/INDEX.md');
    expect(after).not.toContain('_(no concept pages yet');
  });
});
