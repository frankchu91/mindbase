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

  // Seed an existing concept the new raw doc should update
  writeFileSync(join(notesDir, 'sam-altman.md'), '# Sam Altman\n\nCo-founder and CEO of OpenAI.\n');
  writeFileSync(join(notesDir, 'sam-altman.meta.json'), JSON.stringify({
    id: 'sam-altman', type: 'concept', title: 'Sam Altman', one_liner: 'OpenAI CEO',
    kind: 'concept', edit_state: 'compiled', last_human_edit: null,
    created: now, updated: now, sources: [], related: [], compile_version: 0, word_count: 5,
  }));
  writeFileSync(join(srv.dataDir, 'wiki', 'INDEX.md'),
    '- [Sam Altman](wiki/notes/sam-altman.md) — OpenAI CEO\n');

  // Drop a raw doc the ingest will compile.
  // findRawDoc expects: raw/<date>/<id>.meta.json + raw/<date>/<id>.md
  const rawDate = '2026-05-20';
  const rawId = 'sam-update-test';
  const rawDir = join(srv.dataDir, 'raw', rawDate);
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(join(rawDir, `${rawId}.md`),
    'Sam Altman was reinstated to the OpenAI board after a brief leave.');
  writeFileSync(join(rawDir, `${rawId}.meta.json`), JSON.stringify({
    id: rawId,
    title: 'Sam Altman returns to OpenAI board',
    source_url: 'https://example.com/altman-news',
    captured_at: now,
    kind: 'web-clip',
  }));
});
afterAll(async () => { await srv.close(); });

describe('ingest-stream with revision', () => {
  it('LLM reads existing concept then appends/updates it', async () => {
    const res = await fetch(`${srv.url}/api/wiki/ingest-stream/sam-update-test`, { method: 'POST' });
    expect(res.status).toBe(200);
    const text = await res.text();

    // Expect at least one 'reading' event for sam-altman
    expect(text).toMatch(/event:\s*reading[\s\S]*?sam-altman/);
    // Expect at least one 'applied' event targeting sam-altman
    expect(text).toMatch(/event:\s*applied[\s\S]*?sam-altman/);

    // _changes.md should now exist with at least one mutation line for sam-altman
    const fs = await import('node:fs');
    const changesPath = join(srv.dataDir, 'wiki', '_changes.md');
    expect(fs.existsSync(changesPath)).toBe(true);
    const changes = fs.readFileSync(changesPath, 'utf-8');
    expect(changes).toContain('sam-altman');
    expect(changes).toContain('source:sam-update-test');
  });
}, 15000);
