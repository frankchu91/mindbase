import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { bootTestServer, type TestServer } from './helpers/server-fixture';

let srv: TestServer;
beforeAll(async () => { srv = await bootTestServer(); });
afterAll(async () => { await srv.close(); });

describe('POST /api/wiki/notes', () => {
  it('creates a blank note from title', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'My First Note' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string; path: string; content: string; meta: { kind: string; title: string; created_via: string } };
    expect(body.slug).toBe('my-first-note');
    expect(body.path).toBe('wiki/notes/my-first-note.md');
    expect(body.meta.kind).toBe('note');
    expect(body.meta.title).toBe('My First Note');
    expect(body.meta.created_via).toBe('web');
    // File on disk
    expect(existsSync(join(srv.dataDir, 'wiki', 'notes', 'my-first-note.md'))).toBe(true);
    expect(existsSync(join(srv.dataDir, 'wiki', 'notes', 'my-first-note.meta.json'))).toBe(true);
  });

  it('auto-suffixes on slug collision', async () => {
    // First create
    await fetch(`${srv.url}/api/wiki/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Dup Note' }),
    });
    // Second create with same title
    const res = await fetch(`${srv.url}/api/wiki/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Dup Note' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe('dup-note-2');
  });

  it('409 when explicit slug already exists', async () => {
    await fetch(`${srv.url}/api/wiki/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'reserved-slug', title: 'A' }),
    });
    const res = await fetch(`${srv.url}/api/wiki/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'reserved-slug', title: 'B' }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { existing_slug: string };
    expect(body.existing_slug).toBe('reserved-slug');
  });

  it('applies template with variable substitution', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Standup', template: 'meeting' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string; content: string };
    expect(body.content).toContain('Meeting · Standup ·');
    expect(body.content).toContain('## Agenda');
    // Variables substituted
    expect(body.content).not.toContain('{{title}}');
    expect(body.content).not.toContain('{{date}}');
  });

  it('400 on unknown template', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'X', template: 'nonexistent' }),
    });
    expect(res.status).toBe(400);
  });

  it('quick-capture style: no title, content only', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'RAG bottleneck is chunking' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string; content: string; meta: { kind: string } };
    expect(body.slug).toMatch(/^untitled-\d{4}-\d{2}-\d{2}-\d{4}$/);
    expect(body.content).toBe('RAG bottleneck is chunking');
    expect(body.meta.kind).toBe('note');
  });
});

describe('POST /api/wiki/daily', () => {
  it('creates today daily on first call, opens existing on second', async () => {
    const first = await fetch(`${srv.url}/api/wiki/daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(first.status).toBe(200);
    const a = (await first.json()) as { slug: string; created: boolean; content: string; meta: { kind: string } };
    expect(a.slug).toMatch(/^daily-\d{4}-\d{2}-\d{2}$/);
    expect(a.created).toBe(true);
    expect(a.meta.kind).toBe('daily');
    expect(a.content).toContain('## What I did');

    const second = await fetch(`${srv.url}/api/wiki/daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const b = (await second.json()) as { slug: string; created: boolean };
    expect(b.slug).toBe(a.slug);
    expect(b.created).toBe(false);
  });

  it('creates daily for explicit past date with yesterday/tomorrow wikilinks', async () => {
    const res = await fetch(`${srv.url}/api/wiki/daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-05-17' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string; content: string };
    expect(body.slug).toBe('daily-2026-05-17');
    expect(body.content).toContain('[[daily-2026-05-16|Yesterday]]');
    expect(body.content).toContain('[[daily-2026-05-18|Tomorrow]]');
  });
});

describe('GET/PUT /api/wiki/templates', () => {
  it('GET / lists seeded defaults', async () => {
    const res = await fetch(`${srv.url}/api/wiki/templates`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates: Array<{ name: string }> };
    const names = body.templates.map((t) => t.name).sort();
    expect(names).toEqual(['daily', 'meeting', 'note', 'person', 'project']);
  });

  it('GET /:name returns raw markdown', async () => {
    const res = await fetch(`${srv.url}/api/wiki/templates/meeting`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const body = await res.text();
    expect(body).toContain('Meeting');
    expect(body).toContain('## Agenda');
  });

  it('GET /:name 404 for unknown', async () => {
    const res = await fetch(`${srv.url}/api/wiki/templates/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('PUT /:name updates body', async () => {
    const newBody = '# Edited\n\nNew content {{title}}';
    const put = await fetch(`${srv.url}/api/wiki/templates/meeting`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown' },
      body: newBody,
    });
    expect(put.status).toBe(200);
    const get = await fetch(`${srv.url}/api/wiki/templates/meeting`);
    const body = await get.text();
    expect(body).toBe(newBody);
  });

  it('PUT /:name rejects invalid name', async () => {
    const res = await fetch(`${srv.url}/api/wiki/templates/..%2Fetc%2Fpasswd`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown' },
      body: 'x',
    });
    expect([400, 404]).toContain(res.status);
  });
});
