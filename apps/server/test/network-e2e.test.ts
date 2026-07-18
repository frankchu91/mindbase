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
  for (const slug of ['a', 'b']) {
    writeFileSync(join(notesDir, `${slug}.md`), `# ${slug}\n\nBody of ${slug}.`);
    writeFileSync(join(notesDir, `${slug}.meta.json`), JSON.stringify({
      id: slug, type: 'concept', title: slug, one_liner: '', word_count: 3,
      compile_version: 0, edit_state: 'human_touched', last_human_edit: now,
      created: now, updated: now, sources: [], related: [], kind: 'concept',
    }));
  }
  writeFileSync(join(notesDir, 'b.md'), '# b\n\nSee [[a]] for details.');
});
afterAll(async () => { await srv.close(); });

describe('GET /api/network/:slug', () => {
  it('returns NetworkView with mentioned_in', async () => {
    const res = await fetch(`${srv.url}/api/network/a`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string; mentioned_in: Array<{ slug: string }> };
    expect(body.slug).toBe('a');
    expect(body.mentioned_in.map((m) => m.slug)).toContain('b');
  });

  it('400 on invalid slug', async () => {
    const res = await fetch(`${srv.url}/api/network/..%2Fetc`);
    expect([400, 404]).toContain(res.status);
  });

  it('returns empty network for missing slug', async () => {
    const res = await fetch(`${srv.url}/api/network/nonexistent`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { semantic_related: unknown[]; mentioned_in: unknown[] };
    expect(body.semantic_related).toEqual([]);
    expect(body.mentioned_in).toEqual([]);
  });

  it('caches result to disk', async () => {
    await fetch(`${srv.url}/api/network/a`).then((r) => r.json());
    const fs = await import('node:fs');
    expect(fs.existsSync(join(srv.dataDir, 'network', 'a.json'))).toBe(true);
  });
});
