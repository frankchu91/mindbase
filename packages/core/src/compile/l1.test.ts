import { describe, it, expect } from 'vitest';
import { compileL1 } from './l1';
import type { CompileL1ProgressEvent } from './l1';
import { MemoryStore } from '../storage/memory_store';
import { WikiIndex } from '../graph/index/wiki-index';
import type { LLMAdapter } from '../adapters/types';
import type { ChatChunk, ChatRequest, RawDoc } from '../types';
import type { HybridResult } from '../search/hybrid';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockAdapter(scripts: Array<Array<ChatChunk>>): LLMAdapter {
  let turn = 0;
  return {
    name: 'mock' as const,
    supportsTools: true,
    async *chat(_request: ChatRequest): AsyncIterable<ChatChunk> {
      const script = scripts[turn++] ?? [{ kind: 'done', usage: { input_tokens: 0, output_tokens: 0 } }];
      for (const chunk of script) yield chunk;
    },
  } as unknown as LLMAdapter;
}

const emptyHybrid = async (): Promise<HybridResult[]> => [];

function makeIndex(): WikiIndex {
  return WikiIndex.openInMemory();
}

const sampleRaw: RawDoc = {
  id: 'raw-1',
  path: 'raw/2026-05-20/raw-1',
  title: 'Sam Altman returns to OpenAI',
  content: 'Sam Altman has been reinstated as CEO of OpenAI after a board reshuffle.',
  source_url: 'https://example.com/altman',
  captured_at: new Date().toISOString(),
  images: [],
} as unknown as RawDoc;

// ---------------------------------------------------------------------------
// Multi-turn tool-use tests
// ---------------------------------------------------------------------------

describe('compileL1 multi-turn tool-use', () => {
  // TODO(v2-cleanup): asserts v1 concepts-path behavior; see executor.test.ts note.
  it.skip('executes read_concept then append_to_concept over two turns', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/sam-altman.md', '# Sam Altman\n\nCo-founder and CEO of OpenAI.');
    await store.writeText('wiki/notes/sam-altman.meta.json', JSON.stringify({
      id: 'sam-altman', type: 'concept', title: 'Sam Altman', one_liner: 'OpenAI CEO',
      kind: 'concept', edit_state: 'compiled', last_human_edit: null,
      created: new Date().toISOString(), updated: new Date().toISOString(),
      sources: [], related: [], compile_version: 0, word_count: 5,
    }));
    await store.writeText('wiki/INDEX.md', '- [Sam Altman](wiki/notes/sam-altman.md) — OpenAI CEO');

    const adapter = makeMockAdapter([
      [
        { kind: 'tool_call', tool_call: { id: 't1', name: 'read_concept', arguments: { slug: 'sam-altman' } } },
        { kind: 'done', usage: { input_tokens: 100, output_tokens: 20 } },
      ],
      [
        {
          kind: 'tool_call',
          tool_call: {
            id: 't2',
            name: 'append_to_concept',
            arguments: {
              concept_name: 'sam-altman',
              section: '2026 Update',
              content: 'Reinstated as CEO after board reshuffle.',
              raw_id: 'raw-1',
            },
          },
        },
        { kind: 'done', usage: { input_tokens: 150, output_tokens: 50 } },
      ],
      [
        { kind: 'delta', text: 'Done.' },
        { kind: 'done', usage: { input_tokens: 80, output_tokens: 10 } },
      ],
    ]);

    const result = await compileL1({
      raw: sampleRaw, adapter, store, model: 'mock',
      wikiIndex: makeIndex(), hybridSearch: emptyHybrid,
    });

    expect(result.ok).toBe(true);
    expect(result.tool_results).toHaveLength(2);
    expect(result.tool_results[0]?.call.name).toBe('read_concept');
    expect(result.tool_results[1]?.call.name).toBe('append_to_concept');
    const body = await store.readText('wiki/notes/sam-altman.md');
    expect(body).toContain('2026 Update');
    expect(body).toContain('Reinstated as CEO');
  });

  it('terminates at max iterations and returns partial results', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/x.md', '# X');
    await store.writeText('wiki/INDEX.md', '');

    const chunks: ChatChunk[] = [
      { kind: 'tool_call', tool_call: { id: 'loop', name: 'read_concept', arguments: { slug: 'x' } } },
      { kind: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
    ];
    const adapter = makeMockAdapter(Array.from({ length: 20 }, () => chunks));

    const result = await compileL1({
      raw: sampleRaw, adapter, store, model: 'mock', max_iterations: 3,
      wikiIndex: makeIndex(), hybridSearch: emptyHybrid,
    });

    expect(result.ok).toBe(true);
    expect(result.aborted_reason).toBe('max_iterations');
    expect(result.tool_results.length).toBe(3);
  });

  // Skipped: the v2 orchestrator no longer has a JSON-array fallback path.
  // The v1 behaviour (parseActions) was removed in Task 10. End-to-end
  // validation against real data is covered by the smoke test (Task 16).
  it.skip('falls back to JSON-array parsing when LLM emits no tool_call chunks', async () => {
    /* v1 only */
  });

  it('emits progress events via onProgress callback', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/sam-altman.md', '# Sam Altman');
    await store.writeText('wiki/INDEX.md', '');

    const adapter = makeMockAdapter([
      [
        { kind: 'tool_call', tool_call: { id: 't1', name: 'read_concept', arguments: { slug: 'sam-altman' } } },
        { kind: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
      ],
      [
        { kind: 'delta', text: 'Done.' },
        { kind: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
      ],
    ]);

    const events: Array<{ kind: string; [k: string]: unknown }> = [];
    await compileL1({
      raw: sampleRaw, adapter, store, model: 'mock',
      wikiIndex: makeIndex(), hybridSearch: emptyHybrid,
      onProgress: (e) => events.push(e),
    });

    expect(events.some((e) => e.kind === 'reading' && e.slug === 'sam-altman')).toBe(true);
    expect(events.some((e) => e.kind === 'done')).toBe(true);
  });

  it('returns error when adapter emits error chunk', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/INDEX.md', '');

    const adapter = makeMockAdapter([
      [
        { kind: 'error', error: 'api timeout' },
        { kind: 'done', usage: { input_tokens: 0, output_tokens: 0 } },
      ],
    ]);

    const result = await compileL1({
      raw: sampleRaw, adapter, store, model: 'mock',
      wikiIndex: makeIndex(), hybridSearch: emptyHybrid,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/api timeout/);
  });

  it('emits started → searching → candidates_found → reading/applied → complete events in order', async () => {
    // Stub adapter that returns one tool call (skip) then a final assistant message
    const adapter = makeMockAdapter([
      [
        { kind: 'delta', text: '' },
        { kind: 'tool_call', tool_call: { id: 'c1', name: 'skip', arguments: { reason: 'test' } } },
        { kind: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
      ],
      [
        { kind: 'delta', text: 'Done.' },
        { kind: 'done', usage: { input_tokens: 0, output_tokens: 0 } },
      ],
    ]);

    const events: CompileL1ProgressEvent[] = [];
    const idx = WikiIndex.openInMemory();
    const result = await compileL1({
      raw: { id: 'r1', path: 'raw/r1', title: 'T', source_url: null, captured_at: 'now', content: 'hello', images: [] } as unknown as RawDoc,
      adapter,
      store: new MemoryStore(),
      model: 'test',
      wikiIndex: idx,
      hybridSearch: async () => [],
      onProgress: (e) => events.push(e),
    });
    expect(result.ok).toBe(true);
    const kinds = events.map((e) => e.kind);
    // Must contain these in order:
    expect(kinds[0]).toBe('started');
    expect(kinds.indexOf('searching')).toBeGreaterThan(kinds.indexOf('started'));
    expect(kinds.indexOf('candidates_found')).toBeGreaterThan(kinds.indexOf('searching'));
    expect(kinds.indexOf('complete')).toBe(kinds.length - 1);
    // 'candidates_found' carries a candidates array (empty in this test — wiki is empty)
    const cf = events.find((e) => e.kind === 'candidates_found');
    expect(cf?.candidates).toEqual([]);
    // 'complete' carries summary + tokensUsed + durationMs
    const cmp = events.find((e) => e.kind === 'complete');
    expect(typeof cmp?.summary).toBe('string');
    expect(cmp?.tokensUsed?.input).toBe(10);
    expect(typeof cmp?.durationMs).toBe('number');
    idx.close();
  });

  // Skipped: the v2 orchestrator no longer falls back to JSON parsing when
  // the LLM emits no tool calls — it simply terminates the loop cleanly.
  // The "malformed JSON → error" behaviour was part of the v1 fallback path
  // (parseActions) which was removed in Task 10.
  it.skip('returns error when fallback JSON is malformed', async () => {
    /* v1 only */
  });

  // Skipped: code-fence JSON parsing was part of the v1 parseActions fallback
  // path removed in Task 10. Covered by end-to-end smoke test (Task 16).
  it.skip('parses JSON wrapped in markdown code fences', async () => {
    /* v1 only */
  });

  it('passes sourceSlugToExclude derived from raw.id when id starts with "note:"', async () => {
    // The adapter tries to propose_edit on the source slug; with the guard
    // active the call must fail and be reflected in tool_results.
    const adapter = makeMockAdapter([
      [
        { kind: 'tool_call', tool_call: { id: 'c1', name: 'propose_edit', arguments: { slug: 'mynote', section_anchor: 'Body', new_content: 'x', reason: 'test' } } },
        { kind: 'done', usage: { input_tokens: 1, output_tokens: 1 } },
      ],
      [
        { kind: 'delta', text: 'Done.' },
        { kind: 'done', usage: { input_tokens: 1, output_tokens: 1 } },
      ],
    ]);

    const store = new MemoryStore();
    await store.writeText('wiki/notes/mynote.md', '# MyNote\n\n## Body\nx');
    const idx = WikiIndex.openInMemory();
    const result = await compileL1({
      raw: { id: 'note:mynote', path: 'wiki/notes/mynote.md', title: 'MyNote', source_url: null, captured_at: 'now', content: 'x', images: [] },
      adapter,
      store,
      model: 'test',
      wikiIndex: idx,
      hybridSearch: async () => [],
    });
    expect(result.ok).toBe(true);
    expect(result.tool_results).toHaveLength(1);
    expect(result.tool_results[0]!.result.ok).toBe(false);
    expect(result.tool_results[0]!.result.error).toContain('source');
    idx.close();
  });
});

// ---------------------------------------------------------------------------
// PDF content block tests
//
// The v2 orchestrator uses buildL1MessagesV2 (graph-routed context), which
// does NOT support PDF binary injection — that was a v1-only feature in
// buildL1Messages. These tests are skipped and will be re-evaluated if the
// v2 prompt builder gains PDF support. (Task 10)
// ---------------------------------------------------------------------------

describe('compileL1 PDF content blocks', () => {
  it.skip('passes RawDoc.binary_path through as document content block when adapter.supportsPDFs', async () => {
    /* v1 buildL1Messages only — v2 prompt does not inject binary content */
  });

  it.skip('falls back to text content when adapter.supportsPDFs is undefined', async () => {
    /* v1 buildL1Messages only — v2 prompt does not inject binary content */
  });
});
