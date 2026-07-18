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
  for (const slug of ['hub', 'leaf-a', 'leaf-b']) {
    writeFileSync(join(notesDir, `${slug}.md`), `# ${slug}\n\nbody`);
    writeFileSync(join(notesDir, `${slug}.meta.json`), JSON.stringify({
      id: slug, type: 'concept', title: slug, one_liner: slug, word_count: 1,
      compile_version: 0, edit_state: 'compiled', last_human_edit: null,
      created: now, updated: now, sources: [], related: [], kind: 'concept',
    }));
  }
  // leaf-a and leaf-b both link to hub
  writeFileSync(join(notesDir, 'leaf-a.md'), '# leaf-a\n\nSee [[hub]].');
  writeFileSync(join(notesDir, 'leaf-b.md'), '# leaf-b\n\nSee [[hub]].');
});
afterAll(async () => { await srv.close(); });

describe('GET /api/wiki/insights', () => {
  it('returns hubs, orphans, broken_links', async () => {
    const res = await fetch(`${srv.url}/api/wiki/insights`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hubs: Array<{ slug: string; in_count: number }>;
      orphans: string[];
      broken_links: Array<{ from: string; to: string }>;
      generated_at: string;
    };
    // hub has 2 incoming from leaf-a/leaf-b
    expect(body.hubs.find((h) => h.slug === 'hub')).toBeDefined();
    // leaf-a and leaf-b have no incoming links — orphans
    expect(body.orphans).toEqual(expect.arrayContaining(['leaf-a', 'leaf-b']));
    expect(typeof body.generated_at).toBe('string');
  });

  it('uses 24h cache when _insights meta is fresh', async () => {
    const a = await fetch(`${srv.url}/api/wiki/insights`).then((r) => r.json()) as { generated_at: string };
    const b = await fetch(`${srv.url}/api/wiki/insights`).then((r) => r.json()) as { generated_at: string };
    expect(b.generated_at).toBe(a.generated_at);
  });

  it('?refresh=true forces regenerate', async () => {
    const a = await fetch(`${srv.url}/api/wiki/insights`).then((r) => r.json()) as { generated_at: string };
    await new Promise((r) => setTimeout(r, 50));
    const b = await fetch(`${srv.url}/api/wiki/insights?refresh=true`).then((r) => r.json()) as { generated_at: string };
    expect(b.generated_at).not.toBe(a.generated_at);
  });
});
