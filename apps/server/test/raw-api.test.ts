import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootTestServer, type TestServer } from './helpers/server-fixture';

let srv: TestServer;
beforeAll(async () => {
  srv = await bootTestServer();

  // Seed wiki/notes with concept and note kinds
  const notesDir = join(srv.dataDir, 'wiki', 'notes');
  mkdirSync(notesDir, { recursive: true });
  const now = new Date().toISOString();

  function seedWikiNote(slug: string, kind: string) {
    writeFileSync(join(notesDir, `${slug}.md`), `# ${slug}`);
    writeFileSync(join(notesDir, `${slug}.meta.json`), JSON.stringify({
      id: slug, type: 'concept', title: slug, one_liner: 'seed', word_count: 2,
      compile_version: 0, edit_state: 'auto', last_human_edit: null,
      created: now, updated: now, sources: [], related: [], kind,
    }));
  }

  seedWikiNote('alpha', 'concept');
  seedWikiNote('beta', 'person');
  seedWikiNote('gamma', 'project');

  // Seed a raw import
  const rawDir = join(srv.dataDir, 'raw', '2026-05-22');
  const sourcesDir = join(srv.dataDir, 'wiki', 'sources');
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(sourcesDir, { recursive: true });
  writeFileSync(join(rawDir, 'test-raw-1.md'), 'raw content here word word word');
  writeFileSync(join(rawDir, 'test-raw-1.meta.json'), JSON.stringify({
    id: 'test-raw-1',
    title: 'Test Raw',
    source_url: 'https://example.com/article',
    captured_at: now,
    captured_via: 'web',
    kind: 'web-clip',
  }));
  writeFileSync(
    join(sourcesDir, 'test-raw-1.md'),
    '# Source test-raw-1\n\nCited in:\n- [[alpha]](../concepts/alpha.md)\n- [[beta]](../concepts/beta.md)\n',
  );
});

afterAll(async () => { await srv.close(); });

describe('GET /api/wiki/raw', () => {
  it('lists all raw imports with cited_by_concepts', async () => {
    const res = await fetch(`${srv.url}/api/wiki/raw`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { raws: Array<{ id: string; cited_by_concepts: string[]; word_count: number; has_binary: boolean }> };
    const ours = body.raws.find((r) => r.id === 'test-raw-1');
    expect(ours).toBeDefined();
    expect(ours!.cited_by_concepts).toEqual(expect.arrayContaining(['alpha', 'beta']));
    expect(ours!.word_count).toBeGreaterThan(0);
    expect(ours!.has_binary).toBe(false);
  });
});

describe('GET /api/wiki/raw/:id', () => {
  it('returns content and meta for a single raw doc', async () => {
    const res = await fetch(`${srv.url}/api/wiki/raw/test-raw-1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; content: string; meta: { source_url: string }; cited_by_concepts: string[] };
    expect(body.id).toBe('test-raw-1');
    expect(body.content).toContain('raw content');
    expect(body.meta.source_url).toBe('https://example.com/article');
    expect(body.cited_by_concepts).toEqual(expect.arrayContaining(['alpha', 'beta']));
  });

  it('returns 404 for unknown raw id', async () => {
    const res = await fetch(`${srv.url}/api/wiki/raw/no-such-raw`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/wiki/raw/:id/binary', () => {
  it('returns 404 when no binary exists', async () => {
    const res = await fetch(`${srv.url}/api/wiki/raw/test-raw-1/binary`);
    expect(res.status).toBe(404);
  });

  it('serves binary when PDF exists', async () => {
    // Write a fake PDF file alongside the raw doc
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const rawDir = join(srv.dataDir, 'raw', '2026-05-22');
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, 'test-raw-1.pdf'), Buffer.from('%PDF-1.4 fake pdf bytes'));

    const res = await fetch(`${srv.url}/api/wiki/raw/test-raw-1/binary`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
  });
});

describe('GET /api/wiki?category=wiki vs notes', () => {
  it('category=wiki returns only concept/person/project notes', async () => {
    const res = await fetch(`${srv.url}/api/wiki?category=wiki`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: Array<{ slug: string; kind: string }> };
    expect(body.files.length).toBeGreaterThan(0);
    for (const f of body.files) {
      expect(['concept', 'person', 'project']).toContain(f.kind);
    }
    // raw imports should NOT be in wiki category
    expect(body.files.find((f) => f.slug === 'test-raw-1')).toBeUndefined();
  });

  it('category=notes returns kind=note|daily and raw imports', async () => {
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const notesDir = join(srv.dataDir, 'wiki', 'notes');
    const now = new Date().toISOString();
    writeFileSync(join(notesDir, 'my-note.md'), '# My Note');
    writeFileSync(join(notesDir, 'my-note.meta.json'), JSON.stringify({
      id: 'my-note', type: 'concept', title: 'My Note', one_liner: '', word_count: 2,
      compile_version: 0, edit_state: 'human_touched', last_human_edit: now,
      created: now, updated: now, sources: [], related: [], kind: 'note',
    }));

    const res = await fetch(`${srv.url}/api/wiki?category=notes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: Array<{ slug: string; kind: string }> };
    // User-written note should appear
    expect(body.files.find((f) => f.slug === 'my-note')).toBeDefined();
    // Raw import should appear as synthetic entry
    expect(body.files.find((f) => f.slug === 'test-raw-1')).toBeDefined();
    // concept/person/project entries should NOT appear
    expect(body.files.find((f) => f.slug === 'alpha')).toBeUndefined();
  });

  it('category=all (or unset) returns everything in wiki/notes without raw imports', async () => {
    const res = await fetch(`${srv.url}/api/wiki?category=all`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: Array<{ slug: string; kind: string }> };
    // Should include all wiki/notes entries
    expect(body.files.find((f) => f.slug === 'alpha')).toBeDefined();
    expect(body.files.find((f) => f.slug === 'my-note')).toBeDefined();
    // Raw imports should NOT be in the default/all view
    expect(body.files.find((f) => f.slug === 'test-raw-1')).toBeUndefined();
  });
});
