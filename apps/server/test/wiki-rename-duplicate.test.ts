import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootTestServer, type TestServer } from './helpers/server-fixture';

let srv: TestServer;
beforeAll(async () => {
  srv = await bootTestServer();
  const notesDir = join(srv.dataDir, 'wiki', 'notes');
  mkdirSync(notesDir, { recursive: true });
  const now = new Date().toISOString();
  function seedNote(slug: string, body: string, title?: string) {
    writeFileSync(join(notesDir, `${slug}.md`), body);
    writeFileSync(join(notesDir, `${slug}.meta.json`), JSON.stringify({
      id: slug, type: 'concept', title: title ?? slug, one_liner: 'seed', word_count: 5,
      compile_version: 0, edit_state: 'compiled', last_human_edit: null,
      created: now, updated: now, sources: [], related: [], kind: 'concept',
    }));
  }
  seedNote('alpha', '# Alpha\n\nReferences [[beta]] and [[gamma]].', 'Alpha');
  seedNote('beta', '# Beta\n\nLinks to [[alpha]] and [[alpha|Alpha Title]].', 'Beta');
  seedNote('gamma', '# Gamma\n\nNo links here.', 'Gamma');
  writeFileSync(join(srv.dataDir, 'wiki', 'INDEX.md'),
    '- [Alpha](wiki/notes/alpha.md) — seed\n- [Beta](wiki/notes/beta.md) — seed\n- [Gamma](wiki/notes/gamma.md) — seed\n');
});
afterAll(async () => { await srv.close(); });

describe('PATCH /api/wiki/notes/:slug/rename', () => {
  it('renames the note and rewrites wikilinks in other notes', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes/alpha/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_slug: 'alpha-renamed' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; new_slug: string; links_updated: number };
    expect(body.ok).toBe(true);
    expect(body.new_slug).toBe('alpha-renamed');
    expect(body.links_updated).toBeGreaterThanOrEqual(2);

    const fs = await import('node:fs');
    // New file exists, old gone
    expect(fs.existsSync(join(srv.dataDir, 'wiki/notes/alpha-renamed.md'))).toBe(true);
    expect(fs.existsSync(join(srv.dataDir, 'wiki/notes/alpha.md'))).toBe(false);
    // beta's wikilinks rewritten
    const betaBody = fs.readFileSync(join(srv.dataDir, 'wiki/notes/beta.md'), 'utf-8');
    expect(betaBody).toContain('[[alpha-renamed]]');
    expect(betaBody).toContain('[[alpha-renamed|Alpha Title]]');
    expect(betaBody).not.toContain('[[alpha]]');
    expect(betaBody).not.toContain('[[alpha|');
  });

  it('409 when new_slug is taken', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes/gamma/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_slug: 'beta' }),
    });
    expect(res.status).toBe(409);
  });

  it('400 on invalid new_slug', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes/gamma/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_slug: '../bad/path' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/wiki/notes/:slug/duplicate', () => {
  it('duplicates with -copy suffix', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes/gamma/duplicate`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; slug: string };
    expect(body.ok).toBe(true);
    expect(body.slug).toBe('gamma-copy');
    const fs = await import('node:fs');
    expect(fs.existsSync(join(srv.dataDir, 'wiki/notes/gamma-copy.md'))).toBe(true);
  });

  it('uses -copy-2 when -copy is taken', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes/gamma/duplicate`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe('gamma-copy-2');
  });
});

describe('POST /api/wiki/notes/bulk-delete', () => {
  it('deletes multiple notes in one call', async () => {
    // Seed 3 throwaway notes
    const fs = await import('node:fs');
    const path = await import('node:path');
    const notesDir = path.join(srv.dataDir, 'wiki', 'notes');
    const now = new Date().toISOString();
    for (const slug of ['bulk-a', 'bulk-b', 'bulk-c']) {
      fs.writeFileSync(path.join(notesDir, `${slug}.md`), `# ${slug}`);
      fs.writeFileSync(path.join(notesDir, `${slug}.meta.json`), JSON.stringify({
        id: slug, type: 'concept', title: slug, one_liner: '', word_count: 1,
        compile_version: 0, edit_state: 'auto', last_human_edit: null,
        created: now, updated: now, sources: [], related: [], kind: 'concept',
      }));
    }

    const res = await fetch(`${srv.url}/api/wiki/notes/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: ['bulk-a', 'bulk-b', 'bulk-c'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; deleted: string[]; failed: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.deleted).toEqual(expect.arrayContaining(['bulk-a', 'bulk-b', 'bulk-c']));
    expect(body.failed).toHaveLength(0);

    for (const slug of ['bulk-a', 'bulk-b', 'bulk-c']) {
      expect(fs.existsSync(path.join(notesDir, `${slug}.md`))).toBe(false);
      expect(fs.existsSync(path.join(notesDir, `${slug}.meta.json`))).toBe(false);
    }
  });

  it('400 when slugs array is missing', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('400 when slugs is empty after filtering invalid ones', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: ['../bad', '', null, 42] }),
    });
    expect(res.status).toBe(400);
  });

  it('400 when slugs exceeds 200', async () => {
    const many = Array.from({ length: 201 }, (_, i) => `t-${i}`);
    const res = await fetch(`${srv.url}/api/wiki/notes/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: many }),
    });
    expect(res.status).toBe(400);
  });
});
