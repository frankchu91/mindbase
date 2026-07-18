import { describe, it, expect } from 'vitest';
import type { RawDoc, MetaJson, WikiFileType, EditState, ChatChunk } from './types';

describe('core types', () => {
  it('EditState values are exactly auto and human_touched', () => {
    const a: EditState = 'auto';
    const b: EditState = 'human_touched';
    expect([a, b]).toEqual(['auto', 'human_touched']);
  });

  it('WikiFileType covers concept, article, source, index', () => {
    const types: WikiFileType[] = ['concept', 'article', 'source', 'index'];
    expect(types).toHaveLength(4);
  });

  it('MetaJson has required fields with correct shape', () => {
    const m: MetaJson = {
      id: 'concept-abc',
      type: 'concept',
      title: 'Test',
      created: '2026-04-08T00:00:00Z',
      updated: '2026-04-08T00:00:00Z',
      sources: [],
      related: [],
      one_liner: 'A test concept',
      word_count: 0,
      compile_version: 1,
      edit_state: 'auto',
      last_human_edit: null,
    };
    expect(m.edit_state).toBe('auto');
  });

  it('RawDoc carries id, path, captured_at', () => {
    const r: RawDoc = {
      id: 'a1b2c3',
      path: 'raw/2026-04-08/a1b2c3',
      title: 'Hello',
      source_url: null,
      captured_at: '2026-04-08T00:00:00Z',
      content: 'some content',
      images: [],
    };
    expect(r.path).toContain('raw/');
  });

  it('ChatChunk is a discriminated union of delta and done', () => {
    const delta: ChatChunk = { kind: 'delta', text: 'hi' };
    const done: ChatChunk = { kind: 'done', usage: { input_tokens: 10, output_tokens: 5 } };
    expect(delta.kind).toBe('delta');
    expect(done.kind).toBe('done');
  });
});
