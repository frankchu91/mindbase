import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootTestServer, type TestServer } from './helpers/server-fixture';

let srv: TestServer;

beforeAll(async () => {
  srv = await bootTestServer();

  // Seed 5 wiki pages with wikilinks (3 hubs, 2 orphans)
  const wikiDir = join(srv.dataDir, 'wiki', 'notes');
  mkdirSync(wikiDir, { recursive: true });

  const now = new Date().toISOString();

  function writePage(slug: string, title: string, body: string, visibility = 'public') {
    writeFileSync(join(wikiDir, `${slug}.md`), body);
    writeFileSync(
      join(wikiDir, `${slug}.meta.json`),
      JSON.stringify({
        id: slug,
        title,
        type: 'concept',
        one_liner: `One liner for ${title}`,
        edit_state: 'ai_generated',
        created: now,
        updated: now,
        word_count: body.split(/\s+/).length,
        visibility,
      }),
    );
  }

  // Hub A: linked from B and C
  writePage('hub-a', 'Hub A', '# Hub A\n\nThis is hub A.');
  // Hub B: links to A + C + D (3 outgoing)
  writePage('hub-b', 'Hub B', '# Hub B\n\nSee [[hub-a]] and [[hub-c]] and [[hub-d]] for more.');
  // Hub C: links to A (1 outgoing)
  writePage('hub-c', 'Hub C', '# Hub C\n\nRelated to [[hub-a]].');
  // Orphan D: links to A (1 outgoing) but nothing links to it
  writePage('hub-d', 'Hub D', '# Hub D\n\nLinks to [[hub-a]].');
  // Orphan E: internal visibility, no links
  writePage('orphan-e', 'Orphan E', '# Orphan E\n\nThis page has no links.', 'internal');
});

afterAll(async () => {
  await srv.close();
});

describe('Graph API E2E', () => {
  it('GET /api/graph returns valid { nodes, links }', async () => {
    const res = await fetch(`${srv.url}/api/graph`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nodes: unknown[]; links: unknown[] };
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.links)).toBe(true);
  });

  it('all 5 slugs appear in nodes', async () => {
    const res = await fetch(`${srv.url}/api/graph`);
    const body = (await res.json()) as { nodes: Array<{ id: string }> };
    const ids = body.nodes.map((n) => n.id);
    for (const slug of ['hub-a', 'hub-b', 'hub-c', 'hub-d', 'orphan-e']) {
      expect(ids).toContain(slug);
    }
  });

  it('links have source + target as slugs', async () => {
    const res = await fetch(`${srv.url}/api/graph`);
    const body = (await res.json()) as { links: Array<{ source: string; target: string }> };
    // hub-b → hub-a should be present
    const hubBtoA = body.links.find((l) => l.source === 'hub-b' && l.target === 'hub-a');
    expect(hubBtoA).toBeTruthy();
    // hub-c → hub-a should be present
    const hubCtoA = body.links.find((l) => l.source === 'hub-c' && l.target === 'hub-a');
    expect(hubCtoA).toBeTruthy();
  });

  it('GET /api/graph?excludeVisibility=internal filters orphan-e', async () => {
    const res = await fetch(`${srv.url}/api/graph?excludeVisibility=internal`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nodes: Array<{ id: string }> };
    const ids = body.nodes.map((n) => n.id);
    expect(ids).not.toContain('orphan-e');
    // public nodes still present
    expect(ids).toContain('hub-a');
  });
});
