import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { SearchIndex } from '../search/index';
import { askQuestion, type QAEvent, type CitedSource } from './query';
import type { ChatChunk, ChatRequest, MetaJson } from '../types';
import type { LLMAdapter } from '../adapters/types';

function fakeAdapter(script: ChatChunk[][]): LLMAdapter & { calls: ChatRequest[] } {
  let i = 0;
  const calls: ChatRequest[] = [];
  return {
    name: 'openai',
    supportsTools: true,
    calls,
    async *chat(req: ChatRequest) {
      calls.push(req);
      const batch = script[i] ?? [];
      i += 1;
      for (const c of batch) yield c;
    },
    estimateTokens: (t: string) => t.length,
    async testConnection() {
      return { ok: true };
    },
  };
}

async function seedWiki(store: MemoryStore): Promise<SearchIndex> {
  await store.writeText('wiki/INDEX.md', '# MindBase Wiki Index\n\n- [RAG](wiki/notes/rag.md) — overview\n');
  await store.writeText('wiki/notes/rag.md', '# RAG\n\nRetrieval-augmented generation uses external retrieval.');
  const meta: MetaJson = {
    id: 'concept-rag',
    type: 'concept',
    title: 'RAG',
    created: '2026-04-08T00:00:00Z',
    updated: '2026-04-08T00:00:00Z',
    sources: ['r1'],
    related: [],
    one_liner: 'Retrieval augmented generation',
    word_count: 10,
    compile_version: 1,
    edit_state: 'auto',
    last_human_edit: null,
  };
  await store.writeJSON('wiki/notes/rag.meta.json', meta);
  const idx = new SearchIndex();
  idx.add({ path: 'wiki/notes/rag.md', title: 'RAG', body: 'retrieval generation', type: 'concept' });
  return idx;
}

describe('askQuestion', () => {
  let store: MemoryStore;
  let idx: SearchIndex;

  beforeEach(async () => {
    store = new MemoryStore();
    idx = await seedWiki(store);
  });

  it('yields progress events then answer deltas then a done event with citations', async () => {
    const adapter = fakeAdapter([
      [
        {
          kind: 'tool_call',
          tool_call: {
            id: 'c1',
            name: 'read_file',
            arguments: { path: 'wiki/notes/rag.md' },
          },
        },
        { kind: 'done', usage: { input_tokens: 20, output_tokens: 5 } },
      ],
      [
        { kind: 'delta', text: 'RAG combines retrieval with generation [1].' },
        { kind: 'done', usage: { input_tokens: 50, output_tokens: 10 } },
      ],
    ]);

    const events: QAEvent[] = [];
    for await (const e of askQuestion({
      question: 'What is RAG?',
      store,
      index: idx,
      adapter,
      model: 'gpt-4o-mini',
    })) {
      events.push(e);
    }

    const phases = events.filter((e) => e.kind === 'progress').map((e) => (e as { kind: 'progress'; phase: string }).phase);
    expect(phases).toContain('read_index');
    expect(phases).toContain('keyword_filter');
    expect(phases).toContain('llm_call');

    const deltas = events.filter((e) => e.kind === 'delta').map((e) => (e as { kind: 'delta'; text: string }).text).join('');
    expect(deltas).toContain('RAG combines retrieval');

    const done = events.find((e) => e.kind === 'done') as { kind: 'done'; citations: Array<{ path: string }>; usage: { input_tokens: number; output_tokens: number } } | undefined;
    expect(done).toBeDefined();
    expect(done?.citations?.length ?? 0).toBeGreaterThan(0);
    expect(done?.usage.output_tokens).toBeGreaterThan(0);
  });

  it('handles LLM returning no tool calls (answer directly from context)', async () => {
    const adapter = fakeAdapter([
      [
        { kind: 'delta', text: 'RAG is retrieval-augmented generation.' },
        { kind: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
      ],
    ]);
    const events: QAEvent[] = [];
    for await (const e of askQuestion({
      question: 'What is RAG?',
      store,
      index: idx,
      adapter,
      model: 'gpt-4o-mini',
    })) {
      events.push(e);
    }
    const text = events.filter((e) => e.kind === 'delta').map((e) => (e as { kind: 'delta'; text: string }).text).join('');
    expect(text).toContain('retrieval-augmented');
  });

  it('emits sources event exactly once, before any delta, with stable 1-indexed entries', async () => {
    const adapter = fakeAdapter([
      [
        { kind: 'delta', text: 'RAG is retrieval-augmented generation [1].' },
        { kind: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
      ],
    ]);
    const events: QAEvent[] = [];
    for await (const e of askQuestion({
      question: 'What is RAG?',
      store,
      index: idx,
      adapter,
      model: 'gpt-4o-mini',
    })) {
      events.push(e);
    }

    const sourceEvents = events.filter((e) => e.kind === 'sources');
    expect(sourceEvents.length).toBe(1);

    const sourcesEvent = sourceEvents[0] as { kind: 'sources'; sources: CitedSource[] };
    expect(sourcesEvent.sources.length).toBeGreaterThan(0);

    // Verify 1-indexed and stable n values
    sourcesEvent.sources.forEach((s, i) => {
      expect(s.n).toBe(i + 1);
      expect(s.slug).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.path).toBeTruthy();
    });

    // Verify sources event comes BEFORE any delta event
    const sourcesIdx = events.indexOf(sourceEvents[0]!);
    const firstDeltaIdx = events.findIndex((e) => e.kind === 'delta');
    expect(sourcesIdx).toBeLessThan(firstDeltaIdx);
  });

  it('includes sources in the done event matching the sources event', async () => {
    const adapter = fakeAdapter([
      [
        { kind: 'delta', text: 'RAG is retrieval-augmented generation [1].' },
        { kind: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
      ],
    ]);
    const events: QAEvent[] = [];
    for await (const e of askQuestion({
      question: 'What is RAG?',
      store,
      index: idx,
      adapter,
      model: 'gpt-4o-mini',
    })) {
      events.push(e);
    }

    const sourcesEvent = events.find((e) => e.kind === 'sources') as { kind: 'sources'; sources: CitedSource[] } | undefined;
    const doneEvent = events.find((e) => e.kind === 'done') as { kind: 'done'; citations: unknown[]; sources: CitedSource[]; usage: { input_tokens: number; output_tokens: number } } | undefined;

    expect(sourcesEvent).toBeDefined();
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.sources).toBeDefined();
    expect(doneEvent?.sources.length).toBe(sourcesEvent?.sources.length);

    // Sources in done event should match those in the sources event
    doneEvent?.sources.forEach((s, i) => {
      expect(s.n).toBe(sourcesEvent!.sources[i]!.n);
      expect(s.slug).toBe(sourcesEvent!.sources[i]!.slug);
      expect(s.title).toBe(sourcesEvent!.sources[i]!.title);
    });
  });

  it('propagates error chunks as error events', async () => {
    const adapter = fakeAdapter([[{ kind: 'error', error: 'rate limit' }]]);
    const events: QAEvent[] = [];
    for await (const e of askQuestion({
      question: 'What is RAG?',
      store,
      index: idx,
      adapter,
      model: 'gpt-4o-mini',
    })) {
      events.push(e);
    }
    const err = events.find((e) => e.kind === 'error') as { kind: 'error'; error: string } | undefined;
    expect(err?.error).toMatch(/rate limit/);
  });
});
