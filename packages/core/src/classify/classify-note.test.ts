import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import type { LLMAdapter } from '../adapters/types';
import type { ChatChunk, MetaJson } from '../types';
import { classifyNote, type ClassifyResult } from './classify-note';
import { saveFolders } from './folders';
import { saveClassifyRules } from './rules';

function makeAdapter(jsonOutput: string): LLMAdapter {
  return {
    async *chat(): AsyncIterable<ChatChunk> {
      yield { kind: 'delta', text: jsonOutput };
      yield { kind: 'done', usage: { input_tokens: 100, output_tokens: 20 } };
    },
    embed: async () => [],
    supportsPDFs: false,
  } as unknown as LLMAdapter;
}

async function seed(store: MemoryStore, slug: string, title: string, body: string) {
  await store.writeText(`wiki/notes/${slug}.md`, body);
  const meta: Partial<MetaJson> = {
    id: slug, type: 'note', title, created: '2026-05-23T00:00Z', updated: '2026-05-23T00:00Z',
    sources: [], related: [], one_liner: '', word_count: 0,
    compile_version: 0, edit_state: 'auto', last_human_edit: null,
  };
  await store.writeJSON(`wiki/notes/${slug}.meta.json`, meta);
}

describe('classifyNote', () => {
  it('returns folder + reason when LLM emits valid JSON pointing to a real folder', async () => {
    const store = new MemoryStore();
    await saveFolders(store, [
      { path: 'inbox', name: 'Inbox', created_at: 'now' },
      { path: 'journal', name: 'Journal', created_at: 'now' },
    ]);
    await saveClassifyRules(store, '');
    await seed(store, 'note1', 'Morning', 'I felt good today.');
    const adapter = makeAdapter('{"folder": "journal", "reason": "personal reflection"}');
    const result: ClassifyResult = await classifyNote({ adapter, store, slug: 'note1', model: 'test' });
    expect(result.folder).toBe('journal');
    expect(result.reason).toBe('personal reflection');
  });

  it('falls back to inbox when LLM emits non-JSON garbage', async () => {
    const store = new MemoryStore();
    await saveFolders(store, [{ path: 'inbox', name: 'Inbox', created_at: 'now' }]);
    await saveClassifyRules(store, '');
    await seed(store, 'note1', 'X', 'Y');
    const adapter = makeAdapter('not json at all');
    const result = await classifyNote({ adapter, store, slug: 'note1', model: 'test' });
    expect(result.folder).toBe('inbox');
    expect(result.reason.toLowerCase()).toContain('failed');
  });

  it('falls back to inbox when LLM picks a folder not in the list', async () => {
    const store = new MemoryStore();
    await saveFolders(store, [{ path: 'inbox', name: 'Inbox', created_at: 'now' }]);
    await saveClassifyRules(store, '');
    await seed(store, 'note1', 'X', 'Y');
    const adapter = makeAdapter('{"folder": "made-up-folder", "reason": "..."}');
    const result = await classifyNote({ adapter, store, slug: 'note1', model: 'test' });
    expect(result.folder).toBe('inbox');
    expect(result.reason).toContain('made-up-folder');
  });

  it('throws when the note does not exist', async () => {
    const store = new MemoryStore();
    await saveFolders(store, [{ path: 'inbox', name: 'Inbox', created_at: 'now' }]);
    const adapter = makeAdapter('{"folder": "inbox", "reason": "ok"}');
    await expect(classifyNote({ adapter, store, slug: 'missing', model: 'test' }))
      .rejects.toThrow();
  });

  it('falls back to inbox when the adapter throws / errors mid-stream', async () => {
    const store = new MemoryStore();
    await saveFolders(store, [{ path: 'inbox', name: 'Inbox', created_at: 'now' }]);
    await saveClassifyRules(store, '');
    await seed(store, 'note1', 'X', 'Y');
    const adapter: LLMAdapter = {
      async *chat(): AsyncIterable<ChatChunk> {
        yield { kind: 'error', error: 'rate limit' };
      },
      embed: async () => [],
      supportsPDFs: false,
    } as unknown as LLMAdapter;
    const result = await classifyNote({ adapter, store, slug: 'note1', model: 'test' });
    expect(result.folder).toBe('inbox');
    expect(result.reason.toLowerCase()).toMatch(/failed|error/);
  });

  it('appends OCR sidecar text to the note body when attachment refs are present', async () => {
    const store = new MemoryStore();
    await saveFolders(store, [
      { path: 'inbox', name: 'Inbox', created_at: 'now' },
      { path: 'knowledge', name: 'Knowledge', created_at: 'now' },
    ]);
    await saveClassifyRules(store, '');
    await seed(
      store,
      'note1',
      'X',
      '# X\n\n![img](/api/wiki/attachments/note1/aaaaaaaaaaaa.png)',
    );
    // OCR sidecar with the actual text
    await store.writeText('attachments/note1/aaaaaaaaaaaa.png.ocr.txt', 'this is content from the image');

    // Adapter that captures the user message it was called with
    let lastUserMsg = '';
    const adapter: LLMAdapter = {
      async *chat(req): AsyncIterable<ChatChunk> {
        const u = req.messages.find((m) => m.role === 'user');
        if (u && typeof u.content === 'string') lastUserMsg = u.content;
        yield { kind: 'delta', text: '{"folder":"knowledge","reason":"x"}' };
        yield { kind: 'done', usage: { input_tokens: 1, output_tokens: 1 } };
      },
      embed: async () => [],
      supportsPDFs: false,
    } as unknown as LLMAdapter;

    await classifyNote({ adapter, store, slug: 'note1', model: 'test' });
    expect(lastUserMsg).toContain('this is content from the image');
  });
});
