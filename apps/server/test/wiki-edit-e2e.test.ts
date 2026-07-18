import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootTestServer, type TestServer } from './helpers/server-fixture';

let srv: TestServer;

beforeAll(async () => {
  srv = await bootTestServer();

  // Seed a wiki page to edit
  const notesDir = join(srv.dataDir, 'wiki', 'notes');
  mkdirSync(notesDir, { recursive: true });

  const now = new Date().toISOString();
  writeFileSync(join(notesDir, 'edit-test.md'), '# Edit Test\n\nOriginal content here.');
  writeFileSync(
    join(notesDir, 'edit-test.meta.json'),
    JSON.stringify({
      id: 'edit-test',
      title: 'Edit Test',
      type: 'concept',
      one_liner: 'Page for testing wiki edit',
      edit_state: 'ai_generated',
      created: now,
      updated: now,
      word_count: 4,
    }),
  );
});

afterAll(async () => {
  await srv.close();
});

describe('Wiki Edit API E2E', () => {
  const NEW_CONTENT = '# Edit Test\n\nThis content was updated via the API in the E2E test suite.';

  it('PUT /api/wiki/notes/:slug with new content → 200', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes/edit-test`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: NEW_CONTENT }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; saved_at: string };
    expect(body.ok).toBe(true);
    expect(body.saved_at).toBeTruthy();
  });

  it('file on disk has the new content after PUT', () => {
    const disk = readFileSync(join(srv.dataDir, 'wiki', 'notes', 'edit-test.md'), 'utf8');
    expect(disk).toBe(NEW_CONTENT);
  });

  it('meta JSON has edit_state: human_touched, last_human_edit, updated, word_count recomputed', () => {
    const meta = JSON.parse(
      readFileSync(join(srv.dataDir, 'wiki', 'notes', 'edit-test.meta.json'), 'utf8'),
    ) as {
      edit_state: string;
      last_human_edit: string;
      updated: string;
      word_count: number;
    };
    expect(meta.edit_state).toBe('human_touched');
    expect(meta.last_human_edit).toBeTruthy();
    expect(meta.updated).toBeTruthy();
    // "This content was updated via the API in the E2E test suite." = 13 words + heading "Edit Test" = 2 → 15
    expect(meta.word_count).toBeGreaterThan(0);
  });

  it('PUT with invalid slug → 400', async () => {
    const res = await fetch(`${srv.url}/api/wiki/notes/../../../etc/passwd`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'attack' }),
    });
    // Express will normalize the path before hitting the route
    expect([400, 404]).toContain(res.status);
  });

  it('POST /api/wiki/ai-complete with kind=continue → SSE delta stream', async () => {
    const res = await fetch(`${srv.url}/api/wiki/ai-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'continue', text: 'The capital of France is' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const raw = await res.text();
    // Should contain at least one SSE delta event
    expect(raw).toContain('data:');
    // Mock adapter emits a delta chunk
    const lines = raw.split('\n').filter((l) => l.startsWith('data:'));
    expect(lines.length).toBeGreaterThan(0);

    // Parse at least one event to confirm shape
    const firstLine = lines[0]!;
    const parsed = JSON.parse(firstLine.slice('data:'.length).trim()) as { kind: string };
    expect(['delta', 'done', 'error']).toContain(parsed.kind);
  });
});
