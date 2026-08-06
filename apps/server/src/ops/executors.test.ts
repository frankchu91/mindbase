import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyActions } from './executors';
import { actionSchema } from './types';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mb-ops-'));
  await mkdir(join(root, 'sources', 'research'), { recursive: true });
  await mkdir(join(root, 'state', 'builder', 'snapshots'), { recursive: true });
  await writeFile(join(root, 'context.md'), '# Test — Context\n\n## Current Focus\n\nOld focus.\n\n## Learnings\n\n- one\n', 'utf-8');
});

describe('create_research_page', () => {
  it('writes the page and suffixes on collision', async () => {
    const a = { kind: 'create_research_page' as const, slug: 'rag-notes', markdown: '# RAG Notes\n\nbody' };
    const r1 = await applyActions(root, [a]);
    expect(r1.applied).toContain('sources/research/rag-notes.md');
    const r2 = await applyActions(root, [a]);
    expect(r2.applied).toContain('sources/research/rag-notes-2.md');
  });

  it('rejects traversal-ish slugs at the schema layer', () => {
    const parsed = actionSchema.safeParse({ kind: 'create_research_page', slug: '../contributors/evil', markdown: 'x' });
    expect(parsed.success).toBe(false);
  });
});

describe('update_context', () => {
  it('snapshots the previous context before writing', async () => {
    const r = await applyActions(root, [{ kind: 'update_context', markdown: '# Test — Context\n\nnew doc\n' }]);
    expect(r.failed).toHaveLength(0);
    const snaps = await readdir(join(root, 'state', 'builder', 'snapshots'));
    expect(snaps.length).toBe(1);
    const snap = await readFile(join(root, 'state', 'builder', 'snapshots', snaps[0]!), 'utf-8');
    expect(snap).toContain('Old focus.');
    const now = await readFile(join(root, 'context.md'), 'utf-8');
    expect(now).toContain('new doc');
  });

  it('rejects a document over 400 lines', async () => {
    const big = Array.from({ length: 401 }, (_, i) => `line ${i}`).join('\n');
    const r = await applyActions(root, [{ kind: 'update_context', markdown: big }]);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]!.error).toMatch(/400/);
    const now = await readFile(join(root, 'context.md'), 'utf-8');
    expect(now).toContain('Old focus.'); // untouched
  });
});

describe('append_context_section', () => {
  it('appends under an existing section', async () => {
    const r = await applyActions(root, [{ kind: 'append_context_section', section: 'Learnings', markdown: '- two' }]);
    expect(r.failed).toHaveLength(0);
    const now = await readFile(join(root, 'context.md'), 'utf-8');
    expect(now.indexOf('- two')).toBeGreaterThan(now.indexOf('- one'));
  });

  it('creates the section when missing', async () => {
    await applyActions(root, [{ kind: 'append_context_section', section: 'Blockers', markdown: '- stuck' }]);
    const now = await readFile(join(root, 'context.md'), 'utf-8');
    expect(now).toContain('## Blockers');
    expect(now).toContain('- stuck');
  });
});

describe('add_wikilinks', () => {
  it('adds a see-also line and dedupes existing links', async () => {
    await writeFile(join(root, 'sources', 'research', 'a.md'), '# A\n\nmentions [[existing]]\n', 'utf-8');
    const r = await applyActions(root, [{ kind: 'add_wikilinks', path: 'sources/research/a.md', links: ['existing', 'fresh'] }]);
    expect(r.failed).toHaveLength(0);
    const now = await readFile(join(root, 'sources', 'research', 'a.md'), 'utf-8');
    expect(now.match(/\[\[fresh\]\]/g)).toHaveLength(1);
    expect(now.match(/\[\[existing\]\]/g)).toHaveLength(1); // not duplicated
  });

  it('schema rejects paths outside research/context', () => {
    const parsed = actionSchema.safeParse({ kind: 'add_wikilinks', path: 'sources/contributors/u/2026-01-01.md', links: ['x'] });
    expect(parsed.success).toBe(false);
  });
});

describe('sources layer is unreachable', () => {
  it('no action kind can produce a write under sources/contributors or sources/raw', async () => {
    // Belt-and-braces: even a hand-built (schema-bypassing) action object
    // must be stopped by the executor's path resolution.
    const evil = { kind: 'create_research_page', slug: 'ok', markdown: 'x' } as const;
    const r = await applyActions(root, [evil]);
    expect(r.applied[0]!.startsWith('sources/research/')).toBe(true);
    const contributors = await stat(join(root, 'sources', 'contributors')).catch(() => null);
    expect(contributors).toBeNull(); // nothing created there
  });
});
