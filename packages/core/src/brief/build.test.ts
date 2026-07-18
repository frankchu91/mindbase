import { describe, it, expect, vi } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { buildBrief } from './build';
import type { MetaJson } from '../types';
import type { LLMAdapter } from '../adapters/types';

const now = new Date('2026-05-09T12:00:00.000Z');

/** Write a meta.json for a page */
function writeMeta(store: MemoryStore, slug: string, meta: Partial<MetaJson> & { title: string }) {
  const full: MetaJson = {
    id: slug,
    type: 'concept',
    title: meta.title,
    created: meta.created ?? now.toISOString(),
    updated: meta.updated ?? now.toISOString(),
    sources: [],
    related: [],
    one_liner: meta.one_liner ?? `One-liner for ${slug}`,
    word_count: 100,
    compile_version: 1,
    edit_state: 'auto',
    last_human_edit: null,
    ...meta,
  };
  store.writeText(`wiki/notes/${slug}.meta.json`, JSON.stringify(full));
  store.writeText(`wiki/notes/${slug}.md`, `# ${meta.title}\n\nBody text for ${slug} that is fairly long so we can test excerpting.`);
}

function makeMockAdapter(response: string): LLMAdapter {
  return {
    name: 'openai',
    supportsTools: false,
    estimateTokens: () => 10,
    testConnection: async () => ({ ok: true }),
    chat: async function* () {
      yield { kind: 'delta' as const, text: response };
      yield { kind: 'done' as const, usage: { input_tokens: 10, output_tokens: 50 } };
    },
  };
}

describe('buildBrief', () => {
  it('gathers pages updated within 24h and produces citations', async () => {
    const store = new MemoryStore();
    vi.setSystemTime(now);

    // Page updated 6h ago — should be included
    const sixHoursAgo = new Date(now.getTime() - 6 * 3600_000).toISOString();
    writeMeta(store, 'page-a', { title: 'Page A', updated: sixHoursAgo });

    // Page updated 30h ago — should NOT be included in 24h window
    const thirtyHoursAgo = new Date(now.getTime() - 30 * 3600_000).toISOString();
    writeMeta(store, 'page-b', { title: 'Page B', updated: thirtyHoursAgo });

    // Page created exactly 1 year ago (for on-this-day)
    const oneYearAgo = new Date('2025-05-09T12:00:00.000Z').toISOString();
    writeMeta(store, 'page-c', { title: 'Page C', created: oneYearAgo, updated: oneYearAgo });

    const llmResponse = 'You captured some great notes about Page A [1]. Exciting stuff!';
    const adapter = makeMockAdapter(llmResponse);

    const brief = await buildBrief(
      {
        store,
        getAdapter: () => adapter,
        config: { model: 'gpt-4o-mini' },
      },
      { sinceHours: 24, includeOnThisDay: false },
    );

    // Only page-a within 24h window
    expect(brief.citations).toHaveLength(1);
    expect(brief.citations[0].slug).toBe('page-a');
    expect(brief.citations[0].n).toBe(1);
    expect(brief.citations[0].path).toBe('wiki/notes/page-a.md');
    expect(brief.summary).toBe(llmResponse);
    expect(brief.status).toBe('preview-only');
  });

  it('[N] numbering in citations matches context block order (newest-first)', async () => {
    const store = new MemoryStore();
    vi.setSystemTime(now);

    const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000).toISOString();
    const fourHoursAgo = new Date(now.getTime() - 4 * 3600_000).toISOString();

    writeMeta(store, 'recent', { title: 'Recent', updated: twoHoursAgo });
    writeMeta(store, 'older', { title: 'Older', updated: fourHoursAgo });

    const llmResponse = '[1] is the most recent, [2] is older.';
    const adapter = makeMockAdapter(llmResponse);

    const brief = await buildBrief(
      { store, getAdapter: () => adapter, config: { model: 'gpt-4o-mini' } },
      { sinceHours: 24 },
    );

    expect(brief.citations[0].slug).toBe('recent');
    expect(brief.citations[0].n).toBe(1);
    expect(brief.citations[1].slug).toBe('older');
    expect(brief.citations[1].n).toBe(2);
  });

  it('marks brief as failed when LLM returns empty', async () => {
    const store = new MemoryStore();
    vi.setSystemTime(now);

    const sixHoursAgo = new Date(now.getTime() - 6 * 3600_000).toISOString();
    writeMeta(store, 'page-x', { title: 'Page X', updated: sixHoursAgo });

    const adapter = makeMockAdapter(''); // empty response

    const brief = await buildBrief(
      { store, getAdapter: () => adapter, config: { model: 'gpt-4o-mini' } },
      { sinceHours: 24 },
    );

    expect(brief.status).toBe('failed');
    expect(brief.error).toBeTruthy();
    expect(brief.summary).toBe('');
  });

  it('returns minimal brief with no citations when no pages in window', async () => {
    const store = new MemoryStore();
    vi.setSystemTime(now);

    // Page updated 48h ago — outside 24h window
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 3600_000).toISOString();
    writeMeta(store, 'old-page', { title: 'Old Page', updated: fortyEightHoursAgo });

    const adapter = makeMockAdapter('This should not be called');

    const brief = await buildBrief(
      { store, getAdapter: () => adapter, config: { model: 'gpt-4o-mini' } },
      { sinceHours: 24 },
    );

    expect(brief.citations).toHaveLength(0);
    expect(brief.summary).toContain('Quiet day');
    expect(brief.status).toBe('preview-only');
  });

  it('includes on-this-day section when found', async () => {
    const store = new MemoryStore();
    vi.setSystemTime(now);

    // A recent page
    const oneHourAgo = new Date(now.getTime() - 3600_000).toISOString();
    writeMeta(store, 'fresh', { title: 'Fresh', updated: oneHourAgo });

    // A page created exactly 1 year ago
    const oneYearAgo = new Date('2025-05-09T00:00:00.000Z').toISOString();
    writeMeta(store, 'anniversary', {
      title: 'Anniversary Page',
      created: oneYearAgo,
      updated: oneYearAgo,
    });

    const adapter = makeMockAdapter('You wrote about fresh stuff [1].');

    const brief = await buildBrief(
      { store, getAdapter: () => adapter, config: { model: 'gpt-4o-mini' } },
      { sinceHours: 24, includeOnThisDay: true },
    );

    expect(brief.on_this_day).toBeDefined();
    expect(brief.on_this_day?.heading).toBe('On This Day');
    expect(brief.on_this_day?.content).toContain('Anniversary Page');
  });

  it('counts inbox pending', async () => {
    const store = new MemoryStore();
    vi.setSystemTime(now);

    const oneHourAgo = new Date(now.getTime() - 3600_000).toISOString();
    writeMeta(store, 'fresh', { title: 'Fresh', updated: oneHourAgo });

    const adapter = makeMockAdapter('You wrote [1].');

    const inbox = {
      list: async () => [
        { status: 'queued' },
        { status: 'queued' },
        { status: 'compiled' },
      ],
    };

    const brief = await buildBrief(
      { store, getAdapter: () => adapter, config: { model: 'gpt-4o-mini' }, inbox },
      { sinceHours: 24 },
    );

    expect(brief.inbox_pending).toBe(2);
  });
});
