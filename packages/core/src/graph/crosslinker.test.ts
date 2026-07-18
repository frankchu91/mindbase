// packages/core/src/graph/crosslinker.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { crossLink } from './crosslinker';

async function seed(store: MemoryStore, slug: string, body: string, title?: string) {
  await store.writeText(`wiki/notes/${slug}.md`, body);
  await store.writeJSON(`wiki/notes/${slug}.meta.json`, {
    id: `note-${slug}`, type: 'concept', title: title ?? slug,
    created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
    sources: [], related: [], one_liner: '', word_count: body.split(/\s+/).length,
    compile_version: 1, edit_state: 'auto', last_human_edit: null,
  });
}

describe('crossLink', () => {
  let store: MemoryStore;
  beforeEach(() => { store = new MemoryStore(); });

  it('finds unlinked exact title mentions and applies in auto mode', async () => {
    await seed(store, 'rag', '# RAG\n\nUses LLM models.', 'RAG');
    await seed(store, 'llm', '# LLM\n\nLarge language model.', 'LLM');
    const r = await crossLink(store, { mode: 'auto' });
    expect(r.applied).toBeGreaterThan(0);
    const ragBody = await store.readText('wiki/notes/rag.md');
    expect(ragBody).toContain('[[LLM]]');
  });

  it('does not modify files in review mode', async () => {
    await seed(store, 'rag', '# RAG\n\nUses LLM models.', 'RAG');
    await seed(store, 'llm', '# LLM\n\nLarge language model.', 'LLM');
    const r = await crossLink(store, { mode: 'review' });
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.applied).toBe(0);
    const ragBody = await store.readText('wiki/notes/rag.md');
    expect(ragBody).not.toContain('[[LLM]]');
  });

  it('skips already-linked mentions', async () => {
    await seed(store, 'rag', '# RAG\n\nUses [[LLM]] models.', 'RAG');
    await seed(store, 'llm', '# LLM', 'LLM');
    const r = await crossLink(store, { mode: 'auto' });
    expect(r.applied).toBe(0);
  });

  it('skips mentions inside code blocks', async () => {
    await seed(store, 'rag', '# RAG\n\n```\nLLM example code\n```', 'RAG');
    await seed(store, 'llm', '# LLM', 'LLM');
    const r = await crossLink(store, { mode: 'auto' });
    expect(r.applied).toBe(0);
  });

  it('reports confidence levels', async () => {
    await seed(store, 'rag', '# RAG\n\nUses LLM models.', 'RAG');
    await seed(store, 'llm', '# LLM', 'LLM');
    const r = await crossLink(store, { mode: 'review' });
    const llmSuggestion = r.suggestions.find((s) => s.target === 'llm');
    expect(llmSuggestion?.confidence).toBe('extracted');
  });

  it('only applies EXTRACTED in auto mode, not INFERRED', async () => {
    // Create a low-score scenario: title is partial/single common word
    await seed(store, 'foo', '# Foo\n\nGeneric text mentions ML once.', 'Foo');
    await seed(store, 'ml', '# ML', 'ML');
    const r = await crossLink(store, { mode: 'auto' });
    // Even if ML matched, only EXTRACTED gets applied
    for (const s of r.suggestions.filter((s) => s.applied)) {
      expect(s.confidence).toBe('extracted');
    }
  });
});
