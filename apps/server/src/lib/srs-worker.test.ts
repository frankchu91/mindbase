import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CardStore } from '@mindbase/core';
import { SRSExtractor } from './srs-worker';
import type { ServerContext } from '../context';
import type { DirEntry } from '@mindbase/core';

// Minimal mock store
function makeMockStore(entries: DirEntry[] = []) {
  return {
    listDir: vi.fn(async (_path: string) => entries),
    readJSON: vi.fn(async (_path: string) => ({
      title: 'Test Page',
      one_liner: 'A test page',
      tags: ['test'],
    })),
    readText: vi.fn(async (_path: string) => 'This is a test page body with enough content to extract cards from. It covers multiple topics.'),
  };
}

function makeCtx(srs?: Partial<ServerContext['config']['srs']>, storeEntries: DirEntry[] = []): { ctx: ServerContext; store: ReturnType<typeof makeMockStore> } {
  const store = makeMockStore(storeEntries);
  const ctx = {
    config: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: '',
      baseUrl: '',
      autoSave: false,
      mergeSaves: false,
      maxContextChars: 50000,
      srs: {
        enabled: true,
        autoExtract: true,
        cardsPerPage: 3,
        extractionIntervalHours: 6,
        newCardsPerDayLimit: 20,
        ...srs,
      },
    },
    store,
    getAdapter: vi.fn(() => ({
      name: 'openai',
      supportsTools: false,
      estimateTokens: () => 0,
      testConnection: async () => ({ ok: true }),
      chat: async function* () {
        yield { kind: 'delta', text: '[{"question": "What is RAG?", "answer": "Retrieval Augmented Generation."}]' };
        yield { kind: 'done', usage: { input_tokens: 100, output_tokens: 50 } };
      },
    })),
  } as unknown as ServerContext;
  return { ctx, store };
}

let tmpDir: string;
let cards: CardStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'srs-worker-test-'));
  cards = new CardStore(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// TODO(v2-cleanup): SRS extractor reads the v1 wiki/notes + meta.json layout,
// which no longer exists under wiki v2 projects. Rewrite with the SRS revival.
describe.skip('SRSExtractor.tick', () => {
  it('returns zeros when autoExtract is false', async () => {
    const { ctx } = makeCtx({ autoExtract: false });
    const extractor = new SRSExtractor(ctx, cards);
    const result = await extractor.tick();
    expect(result.pagesScanned).toBe(0);
    expect(result.pagesExtracted).toBe(0);
    expect(result.cardsCreated).toBe(0);
  });

  it('returns zeros when enabled is false', async () => {
    const { ctx } = makeCtx({ enabled: false });
    const extractor = new SRSExtractor(ctx, cards);
    const result = await extractor.tick();
    expect(result.pagesScanned).toBe(0);
  });

  it('skips pages that already have cards', async () => {
    const entries: DirEntry[] = [
      { kind: 'file', name: 'existing-page.meta.json' },
    ];
    const { ctx } = makeCtx({}, entries);
    const extractor = new SRSExtractor(ctx, cards);

    // Pre-create a card with the same source_slug
    await cards.create({ question: 'Q', answer: 'A', source_slug: 'existing-page' });

    const result = await extractor.tick();
    expect(result.pagesScanned).toBe(1);
    expect(result.pagesExtracted).toBe(0); // skipped because cards already exist
    expect(result.cardsCreated).toBe(0);
  });

  it('extracts cards from pages without existing cards', async () => {
    const entries: DirEntry[] = [
      { kind: 'file', name: 'new-page.meta.json' },
    ];
    const { ctx } = makeCtx({}, entries);
    const extractor = new SRSExtractor(ctx, cards);

    const result = await extractor.tick();
    expect(result.pagesScanned).toBe(1);
    expect(result.pagesExtracted).toBe(1);
    expect(result.cardsCreated).toBe(1);
  });

  it('respects daily cap', async () => {
    // Create 19 cards to get near the cap of 20
    for (let i = 0; i < 19; i++) {
      await cards.create({ question: `Q${i}`, answer: `A${i}` });
    }

    const entries: DirEntry[] = [
      { kind: 'file', name: 'page-a.meta.json' },
      { kind: 'file', name: 'page-b.meta.json' },
    ];
    const { ctx } = makeCtx({ newCardsPerDayLimit: 20 }, entries);
    const extractor = new SRSExtractor(ctx, cards);

    // Each page would create 1 card (from mock adapter). First page puts us at 20 (limit).
    // Second page should be skipped due to cap.
    const result = await extractor.tick();
    expect(result.cardsCreated).toBe(1); // only first page extracted
  });

  it('errors per page do not crash the loop', async () => {
    const entries: DirEntry[] = [
      { kind: 'file', name: 'bad-page.meta.json' },
      { kind: 'file', name: 'good-page.meta.json' },
    ];
    const store = makeMockStore(entries);
    // Make readText fail on first call, succeed on second
    let callCount = 0;
    store.readText = vi.fn(async (_path: string) => {
      callCount++;
      if (callCount === 1) throw new Error('Failed to read file');
      return 'Good page content for extraction.';
    });

    const ctx = {
      config: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: '',
        baseUrl: '',
        autoSave: false,
        mergeSaves: false,
        maxContextChars: 50000,
        srs: {
          enabled: true,
          autoExtract: true,
          cardsPerPage: 3,
          extractionIntervalHours: 6,
          newCardsPerDayLimit: 20,
        },
      },
      store,
      getAdapter: vi.fn(() => ({
        name: 'openai',
        supportsTools: false,
        estimateTokens: () => 0,
        testConnection: async () => ({ ok: true }),
        chat: async function* () {
          yield { kind: 'delta', text: '[{"question": "What is RAG?", "answer": "Retrieval Augmented Generation."}]' };
          yield { kind: 'done', usage: { input_tokens: 100, output_tokens: 50 } };
        },
      })),
    } as unknown as ServerContext;

    const extractor = new SRSExtractor(ctx, cards);
    const result = await extractor.tick();

    // Should have at least one error
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    // Should continue and process second page (or at least not throw)
    expect(result.pagesScanned).toBe(2);
  });

  it('skips non-meta.json files', async () => {
    const entries: DirEntry[] = [
      { kind: 'file', name: 'some-page.md' },
      { kind: 'directory', name: 'subdir' },
      { kind: 'file', name: 'valid-page.meta.json' },
    ];
    const { ctx } = makeCtx({}, entries);
    const extractor = new SRSExtractor(ctx, cards);
    const result = await extractor.tick();
    expect(result.pagesScanned).toBe(1); // only valid-page.meta.json
  });
});
