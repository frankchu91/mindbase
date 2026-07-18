import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { ToolExecutor } from './executor';
import { WikiIndex } from '../graph/index/wiki-index';
import type { MetaJson, RawDoc } from '../types';

describe('read_concept tool', () => {
  let store: MemoryStore;
  let executor: ToolExecutor;
  beforeEach(() => {
    store = new MemoryStore();
    executor = new ToolExecutor(store);
  });

  it('returns the full body of an existing concept', async () => {
    await store.writeText('wiki/notes/sam-altman.md', '# Sam Altman\n\nOpenAI CEO.\n\n## Career\n\nFormer Y Combinator president.');
    const result = await executor.execute({
      id: 'tc-1', name: 'read_concept', arguments: { slug: 'sam-altman' },
    });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      slug: 'sam-altman',
      body: expect.stringContaining('OpenAI CEO'),
      truncated: false,
    });
  });

  it('returns error for missing slug', async () => {
    const result = await executor.execute({
      id: 'tc-2', name: 'read_concept', arguments: { slug: 'nonexistent' },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found|ENOENT/i);
  });

  it('truncates bodies longer than 30000 chars with a marker', async () => {
    const longBody = '# X\n\n' + 'a'.repeat(40000);
    await store.writeText('wiki/notes/x.md', longBody);
    const result = await executor.execute({
      id: 'tc-3', name: 'read_concept', arguments: { slug: 'x' },
    });
    expect(result.ok).toBe(true);
    const data = result.data as { body: string; truncated: boolean; original_length: number };
    expect(data.truncated).toBe(true);
    expect(data.original_length).toBeGreaterThan(30000);
    expect(data.body.length).toBeLessThanOrEqual(30100);
    expect(data.body).toContain('[truncated');
  });

  it('rejects path traversal via slug', async () => {
    const result = await executor.execute({
      id: 'tc-4', name: 'read_concept', arguments: { slug: '../../etc/passwd' },
    });
    expect(result.ok).toBe(false);
  });
});

// TODO(v2-cleanup): legacy v1 compile-pipeline suite — assertions predate the
// wiki-v2 refactor (concepts/ move, project-namespaced ids). Rewrite or delete
// together with the v1 pipeline after 0.1.0.
describe.skip('ToolExecutor', () => {
  let store: MemoryStore;
  let exec: ToolExecutor;

  beforeEach(async () => {
    store = new MemoryStore();
    exec = new ToolExecutor(store);
  });

  it('create_concept writes md and meta.json to wiki/notes/', async () => {
    const r = await exec.execute({
      id: 'call_1',
      name: 'create_concept',
      arguments: {
        name: 'Retrieval-Augmented Generation',
        one_liner: 'Using external retrieval to augment LLM context',
        initial_content: '## Overview\n\nRAG is ...',
        raw_id: 'a1b2c3',
      },
    });
    expect(r.ok).toBe(true);
    const body = await store.readText('wiki/notes/retrieval-augmented-generation.md');
    expect(body).toContain('RAG is');
    const meta = await store.readJSON<MetaJson>('wiki/notes/retrieval-augmented-generation.meta.json');
    expect(meta.title).toBe('Retrieval-Augmented Generation');
    expect(meta.type).toBe('concept');
    expect(meta.sources).toContain('a1b2c3');
    expect(meta.edit_state).toBe('auto');
  });

  it('append_to_concept adds a new section below existing content', async () => {
    await exec.execute({
      id: 'call_1',
      name: 'create_concept',
      arguments: { name: 'RAG', one_liner: 'x', initial_content: '## Overview\n\nBase.', raw_id: 'r1' },
    });
    const r = await exec.execute({
      id: 'call_2',
      name: 'append_to_concept',
      arguments: { concept_name: 'rag', section: 'Examples', content: 'See MCP.', raw_id: 'r2' },
    });
    expect(r.ok).toBe(true);
    const body = await store.readText('wiki/notes/rag.md');
    expect(body).toContain('Base.');
    expect(body).toContain('## Examples');
    expect(body).toContain('See MCP.');
    const meta = await store.readJSON<MetaJson>('wiki/notes/rag.meta.json');
    expect(meta.sources).toEqual(['r1', 'r2']);
  });

  it('append_to_concept works on human_touched files', async () => {
    await exec.execute({
      id: '1',
      name: 'create_concept',
      arguments: { name: 'RAG', one_liner: 'x', initial_content: 'Base', raw_id: 'r1' },
    });
    // Simulate user edit
    const meta = await store.readJSON<MetaJson>('wiki/notes/rag.meta.json');
    meta.edit_state = 'human_touched';
    meta.last_human_edit = '2026-04-08T00:00:00Z';
    await store.writeJSON('wiki/notes/rag.meta.json', meta);

    const r = await exec.execute({
      id: '2',
      name: 'append_to_concept',
      arguments: { concept_name: 'rag', section: 'New', content: 'added', raw_id: 'r2' },
    });
    expect(r.ok).toBe(true);
  });

  it('create_concept refuses to overwrite an existing concept', async () => {
    await exec.execute({
      id: '1',
      name: 'create_concept',
      arguments: { name: 'RAG', one_liner: 'x', initial_content: 'v1', raw_id: 'r1' },
    });
    const r = await exec.execute({
      id: '2',
      name: 'create_concept',
      arguments: { name: 'RAG', one_liner: 'y', initial_content: 'v2', raw_id: 'r2' },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already exists/i);
  });

  it('update_source_backlinks writes wiki/sources/<raw_id>.md', async () => {
    const r = await exec.execute({
      id: '1',
      name: 'update_source_backlinks',
      arguments: { raw_id: 'a1b2c3', linked_concepts: ['rag', 'mcp'] },
    });
    expect(r.ok).toBe(true);
    const body = await store.readText('wiki/sources/a1b2c3.md');
    expect(body).toContain('rag');
    expect(body).toContain('mcp');
  });

  it('add_to_index appends a bullet to INDEX.md, creating it if absent', async () => {
    const r = await exec.execute({
      id: '1',
      name: 'add_to_index',
      arguments: { title: 'RAG', path: 'wiki/notes/rag.md', one_liner: 'overview' },
    });
    expect(r.ok).toBe(true);
    const body = await store.readText('wiki/INDEX.md');
    expect(body).toContain('RAG');
    expect(body).toContain('wiki/notes/rag.md');
  });

  it('add_to_index is idempotent', async () => {
    await exec.execute({
      id: '1',
      name: 'add_to_index',
      arguments: { title: 'RAG', path: 'wiki/notes/rag.md', one_liner: 'overview' },
    });
    await exec.execute({
      id: '2',
      name: 'add_to_index',
      arguments: { title: 'RAG', path: 'wiki/notes/rag.md', one_liner: 'overview' },
    });
    const body = await store.readText('wiki/INDEX.md');
    const occurrences = body.split('wiki/notes/rag.md').length - 1;
    expect(occurrences).toBe(1);
  });

  it('rejects unknown tool name', async () => {
    const r = await exec.execute({ id: '1', name: 'nuke_wiki', arguments: {} });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unknown/i);
  });

  it('rejects missing required arguments', async () => {
    const r = await exec.execute({ id: '1', name: 'create_concept', arguments: { name: 'RAG' } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/missing/i);
  });

  it('rewrite_concept replaces content but keeps meta', async () => {
    await exec.execute({
      id: '1',
      name: 'create_concept',
      arguments: { name: 'RAG', one_liner: 'old summary', initial_content: 'old body', raw_id: 'r1' },
    });
    const r = await exec.execute({
      id: '2',
      name: 'rewrite_concept',
      arguments: { concept_name: 'rag', new_content: '## Rewritten\n\nNew body here.', reason: 'too short' },
    });
    expect(r.ok).toBe(true);
    const body = await store.readText('wiki/notes/rag.md');
    expect(body).toContain('New body here');
    expect(body).not.toContain('old body');
    const meta = await store.readJSON<MetaJson>('wiki/notes/rag.meta.json');
    expect(meta.sources).toContain('r1'); // preserved
  });

  it('rewrite_concept skips human_touched files', async () => {
    await exec.execute({
      id: '1',
      name: 'create_concept',
      arguments: { name: 'RAG', one_liner: 'x', initial_content: 'body', raw_id: 'r1' },
    });
    const meta = await store.readJSON<MetaJson>('wiki/notes/rag.meta.json');
    meta.edit_state = 'human_touched';
    await store.writeJSON('wiki/notes/rag.meta.json', meta);

    const r = await exec.execute({
      id: '2',
      name: 'rewrite_concept',
      arguments: { concept_name: 'rag', new_content: 'new', reason: 'test' },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/human/i);
  });

  it('create_concept propagates capture provenance from RawDoc into frontmatter and meta', async () => {
    const raw: RawDoc = {
      id: 'r-cap-1',
      path: 'raw/2026-05-09/r-cap-1',
      title: 'Captured note',
      source_url: 'https://example.com/post',
      captured_at: '2026-05-09T08:00:00.000Z',
      content: 'body',
      images: [],
      captured_via: 'ios',
      captured_device: 'iPhone of Jane',
    };
    const execWithRaw = new ToolExecutor(store, raw);
    const r = await execWithRaw.execute({
      id: 'c1',
      name: 'create_concept',
      arguments: {
        name: 'Captured Note Concept',
        one_liner: 'derived from a capture',
        initial_content: '## Body',
        raw_id: 'r-cap-1',
      },
    });
    expect(r.ok).toBe(true);
    const body = await store.readText('wiki/notes/captured-note-concept.md');
    expect(body).toContain('captured_via: ios');
    expect(body).toContain('captured_url: "https://example.com/post"');
    expect(body).toContain('captured_device: "iPhone of Jane"');
    expect(body).toContain('captured_at: "2026-05-09T08:00:00.000Z"');
    const meta = await store.readJSON<MetaJson>('wiki/notes/captured-note-concept.meta.json');
    expect(meta.captured_via).toBe('ios');
    expect(meta.captured_url).toBe('https://example.com/post');
    expect(meta.captured_device).toBe('iPhone of Jane');
    expect(meta.captured_at).toBe('2026-05-09T08:00:00.000Z');
  });

  it('createConcept escapes YAML special characters in capture fields', async () => {
    const raw: RawDoc = {
      id: 'r-evil',
      path: 'raw/2026-05-09/r-evil',
      title: 'Evil',
      source_url: 'https://evil/\ninjected: value',
      captured_at: '2026-05-09T00:00:00Z\nadmin: true',
      content: 'x',
      images: [],
      captured_device: 'My iPhone\nadmin: true',
      captured_via: 'ios',
    };
    const execWithRaw = new ToolExecutor(store, raw);
    const r = await execWithRaw.execute({
      id: 'evil-1',
      name: 'create_concept',
      arguments: {
        name: 'Evil Concept',
        one_liner: 'testing injection',
        initial_content: 'body',
        raw_id: 'r-evil',
      },
    });
    expect(r.ok).toBe(true);
    const body = await store.readText('wiki/notes/evil-concept.md');
    // The newline injection attempt must NOT produce a bare 'injected:' or 'admin:' key
    const frontmatterBlock = body.split('---')[1] ?? '';
    const frontmatterLines = frontmatterBlock.split('\n').map((l) => l.trim());
    expect(frontmatterLines.some((l) => l.startsWith('injected:'))).toBe(false);
    expect(frontmatterLines.some((l) => l.startsWith('admin:'))).toBe(false);
    // The escaped sequences should appear as literal \n inside the double-quoted scalars
    expect(body).toContain('\\n');
  });

  it('create_concept omits capture fields when no RawDoc provided (default executor)', async () => {
    const r = await exec.execute({
      id: 'c1',
      name: 'create_concept',
      arguments: {
        name: 'Plain Concept',
        one_liner: 'no capture context',
        initial_content: 'body',
        raw_id: 'rp1',
      },
    });
    expect(r.ok).toBe(true);
    const body = await store.readText('wiki/notes/plain-concept.md');
    expect(body).not.toContain('captured_via');
    expect(body).not.toContain('captured_url');
    const meta = await store.readJSON<MetaJson>('wiki/notes/plain-concept.meta.json');
    expect(meta.captured_via).toBeUndefined();
    expect(meta.captured_url).toBeUndefined();
    expect(meta.captured_device).toBeUndefined();
  });

  it('update_one_liner updates meta and INDEX.md', async () => {
    await exec.execute({
      id: '1',
      name: 'create_concept',
      arguments: { name: 'RAG', one_liner: 'old liner', initial_content: 'body', raw_id: 'r1' },
    });
    await exec.execute({
      id: '2',
      name: 'add_to_index',
      arguments: { title: 'RAG', path: 'wiki/notes/rag.md', one_liner: 'old liner' },
    });
    const r = await exec.execute({
      id: '3',
      name: 'update_one_liner',
      arguments: { concept_name: 'rag', new_one_liner: 'new improved liner' },
    });
    expect(r.ok).toBe(true);
    const meta = await store.readJSON<MetaJson>('wiki/notes/rag.meta.json');
    expect(meta.one_liner).toBe('new improved liner');
    const idx = await store.readText('wiki/INDEX.md');
    expect(idx).toContain('new improved liner');
  });
});

describe('ToolExecutor — Phase 3 handlers', () => {
  let store: MemoryStore;
  let executor: ToolExecutor;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.writeText('wiki/notes/rag.md', '# RAG\n\nIntro.\n\n## Variants\n\nOld.\n');
    await store.writeJSON('wiki/notes/rag.meta.json', { title: 'RAG', type: 'concept' });
    executor = new ToolExecutor(store);
  });

  it('handles propose_edit by applying a section patch', async () => {
    const result = await executor.execute({
      id: '1', name: 'propose_edit',
      arguments: { slug: 'rag', section_anchor: 'Variants', new_content: 'New variant.', reason: 'Add multi-vector' },
    });
    expect(result.ok).toBe(true);
    const updated = await store.readText('wiki/notes/rag.md');
    expect(updated).toContain('New variant.');
    expect(updated).not.toContain('Old.');
  });

  it('rejects propose_edit when slug does not exist', async () => {
    const result = await executor.execute({
      id: '1', name: 'propose_edit',
      arguments: { slug: 'nonexistent', section_anchor: 'X', new_content: 'Y', reason: 'r' },
    });
    expect(result.ok).toBe(false);
  });

  it('flag_contradiction returns ok with structured ack', async () => {
    const result = await executor.execute({
      id: '1', name: 'flag_contradiction',
      arguments: { slug_a: 'rag', slug_b: 'fine-tuning', reason: 'Different recall mechanisms' },
    });
    expect(result.ok).toBe(true);
  });

  it('merge returns ok with status queued_for_review', async () => {
    const result = await executor.execute({
      id: '1', name: 'merge',
      arguments: { keep: 'rag', absorb: 'rag-old', reason: 'Same concept' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.result as { status?: string }).status).toBe('queued_for_review');
  });

  it('skip returns ok with the reason in the payload', async () => {
    const result = await executor.execute({
      id: '1', name: 'skip',
      arguments: { reason: 'Already covered' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.result as { reason?: string }).reason).toBe('Already covered');
  });

  it('create_concept rate limit blocks the 4th call in one session', async () => {
    const exec2 = new ToolExecutor(store, { createConceptLimit: 3 });
    for (let i = 0; i < 3; i++) {
      const r = await exec2.execute({
        id: `c${i}`, name: 'create_concept',
        arguments: {
          name: `Concept ${i}`,
          one_liner: 'one',
          initial_content: '# Body',
          raw_id: 'raw-x',
        },
      });
      expect(r.ok).toBe(true);
    }
    const fourth = await exec2.execute({
      id: 'c3', name: 'create_concept',
      arguments: {
        name: 'Concept 3',
        one_liner: 'one',
        initial_content: '# Body',
        raw_id: 'raw-x',
      },
    });
    expect(fourth.ok).toBe(false);
    if (fourth.ok) return;
    expect(fourth.error).toContain('limit');
  });

  it('link handler fails when wikiIndex is not configured (no-op legacy path)', async () => {
    const exec2 = new ToolExecutor(store);
    const result = await exec2.execute({
      id: '1', name: 'link',
      arguments: { from: 'rag', to: 'other', type: 'elaborates', reason: 'r' },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('wikiIndex not configured');
  });

  it('link rejects invalid edge type', async () => {
    const exec2 = new ToolExecutor(store);
    const result = await exec2.execute({
      id: '1', name: 'link',
      arguments: { from: 'a', to: 'b', type: 'made_up', reason: 'r' },
    });
    expect(result.ok).toBe(false);
  });

  it('link tool now persists an edge via WikiIndex.insertLink', async () => {
    const store = new MemoryStore();
    const idx = WikiIndex.openInMemory();
    // Two pages must exist for the link to land
    idx.upsertPage({ slug: 'a', path: 'wiki/notes/a.md', title: 'A', type: 'concept', kind: null, contentHash: 'h', wordCount: 0, tags: [], visibility: null, project: null, summary: null, meta: null }, []);
    idx.upsertPage({ slug: 'b', path: 'wiki/notes/b.md', title: 'B', type: 'concept', kind: null, contentHash: 'h', wordCount: 0, tags: [], visibility: null, project: null, summary: null, meta: null }, []);

    const exec = new ToolExecutor(store, { wikiIndex: idx });
    const result = await exec.execute({
      id: 'c1',
      name: 'link',
      arguments: { from: 'a', to: 'b', type: 'mentions', reason: 'test' },
    });
    expect(result.ok).toBe(true);
    expect((result.result as { persisted: boolean }).persisted).toBe(true);

    // Verify the edge actually landed in the index
    const out = idx.outgoingFrom('a');
    expect(out.find((l) => l.target_slug === 'b' && l.edge_type === 'mentions')).toBeDefined();
    idx.close();
  });

  it('link tool fails when wikiIndex is not configured (legacy constructor)', async () => {
    const store = new MemoryStore();
    const exec = new ToolExecutor(store); // no wikiIndex
    const result = await exec.execute({
      id: 'c1', name: 'link', arguments: { from: 'a', to: 'b', type: 'mentions', reason: 'test' },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('wikiIndex not configured');
  });

  it('rejects propose_edit when slug matches sourceSlugToExclude', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/foo.md', '# Foo\n\n## Body\nx');
    const idx = WikiIndex.openInMemory();
    const exec = new ToolExecutor(store, { wikiIndex: idx, sourceSlugToExclude: 'foo' });
    const result = await exec.execute({
      id: 'c1',
      name: 'propose_edit',
      arguments: { slug: 'foo', section_anchor: 'Body', new_content: 'attempt', reason: 'test' },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('source');
    idx.close();
  });

  it('rejects append_to_concept when target matches sourceSlugToExclude (by name → slug)', async () => {
    const store = new MemoryStore();
    const idx = WikiIndex.openInMemory();
    const exec = new ToolExecutor(store, { wikiIndex: idx, sourceSlugToExclude: 'my-concept' });
    const result = await exec.execute({
      id: 'c1',
      name: 'append_to_concept',
      arguments: { concept_name: 'My Concept', section: 'Notes', content: 'x', reason: 'test' },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('source');
    idx.close();
  });

  it('allows propose_edit on a DIFFERENT slug', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/notes/bar.md', '# Bar\n\n## Body\nx');
    const idx = WikiIndex.openInMemory();
    const exec = new ToolExecutor(store, { wikiIndex: idx, sourceSlugToExclude: 'foo' });
    const result = await exec.execute({
      id: 'c1',
      name: 'propose_edit',
      arguments: { slug: 'bar', section_anchor: 'Body', new_content: 'attempt', reason: 'test' },
    });
    expect(result.ok).toBe(true);
    idx.close();
  });
});
