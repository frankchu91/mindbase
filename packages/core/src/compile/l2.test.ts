import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { compileL2 } from './l2';
import type { ChatChunk, ChatRequest, MetaJson } from '../types';
import type { LLMAdapter } from '../adapters/types';

function fakeAdapter(
  responses: ChatChunk[][],
): LLMAdapter & { calls: ChatRequest[] } {
  let i = 0;
  const calls: ChatRequest[] = [];
  return {
    name: 'openai',
    supportsTools: true,
    calls,
    async *chat(req: ChatRequest) {
      calls.push(req);
      const batch = responses[i] ?? [];
      i += 1;
      for (const c of batch) yield c;
    },
    estimateTokens: (t: string) => t.length,
    async testConnection() {
      return { ok: true };
    },
  };
}

describe('compileL2', () => {
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.writeText('wiki/INDEX.md', '# MindBase Wiki Index\n\n- [RAG](wiki/notes/rag.md) — old liner\n');
    await store.writeText('wiki/notes/rag.md', '# RAG\n\nShort.');
    await store.writeJSON('wiki/notes/rag.meta.json', {
      id: 'concept-rag',
      type: 'concept',
      title: 'RAG',
      created: '2026-04-18T00:00:00Z',
      updated: '2026-04-18T00:00:00Z',
      sources: ['r1'],
      related: [],
      one_liner: 'old liner',
      word_count: 2,
      compile_version: 1,
      edit_state: 'auto',
      last_human_edit: null,
    } satisfies MetaJson);
  });

  // TODO(v2-cleanup): asserts v1 concepts-path behavior; see executor.test.ts note.
  it.skip('executes L2 actions from JSON response', async () => {
    const jsonResponse = JSON.stringify([
      { action: 'update_one_liner', concept_name: 'rag', new_one_liner: 'Retrieval-augmented generation for grounded LLM responses' },
      { action: 'rewrite_concept', concept_name: 'rag', new_content: '## Overview\n\nRAG combines retrieval with generation to produce accurate answers.', reason: 'Too short' },
    ]);
    const adapter = fakeAdapter([
      [
        { kind: 'delta', text: jsonResponse },
        { kind: 'done', usage: { input_tokens: 100, output_tokens: 50 } },
      ],
    ]);

    const result = await compileL2({ adapter, store, model: 'test' });

    expect(result.ok).toBe(true);
    expect(result.tool_results.length).toBe(2);
    const meta = await store.readJSON<MetaJson>('wiki/notes/rag.meta.json');
    expect(meta.one_liner).toBe('Retrieval-augmented generation for grounded LLM responses');
    const body = await store.readText('wiki/notes/rag.md');
    expect(body).toContain('combines retrieval with generation');
  });

  it('returns empty results when LLM says wiki is fine', async () => {
    const adapter = fakeAdapter([
      [
        { kind: 'delta', text: '[]' },
        { kind: 'done', usage: { input_tokens: 50, output_tokens: 2 } },
      ],
    ]);
    const result = await compileL2({ adapter, store, model: 'test' });
    expect(result.ok).toBe(true);
    expect(result.tool_results).toHaveLength(0);
  });

  it('returns error on bad JSON', async () => {
    const adapter = fakeAdapter([
      [
        { kind: 'delta', text: 'This wiki looks great!' },
        { kind: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
      ],
    ]);
    const result = await compileL2({ adapter, store, model: 'test' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/parse|JSON/i);
  });
});
