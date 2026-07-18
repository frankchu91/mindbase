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
  writeFileSync(join(notesDir, 'rag-1.md'), '# RAG note 1\n\nChunking is the bottleneck.');
  writeFileSync(join(notesDir, 'rag-1.meta.json'), JSON.stringify({
    id: 'rag-1', type: 'concept', title: 'RAG note 1',
    one_liner: '', word_count: 6, compile_version: 0,
    edit_state: 'human_touched', last_human_edit: now,
    created: now, updated: now, sources: [], related: [],
    kind: 'concept',
  }));
  // Populate the in-memory search index so hybridSearch can find the note
  await srv.ctx.reindexWiki();
});
afterAll(async () => { await srv.close(); });

describe('POST /api/synthesize', () => {
  it('returns SSE stream with done event, ≥1 thread event, and cached:false in meta', async () => {
    const res = await fetch(`${srv.url}/api/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'RAG' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    expect(text).toContain('event: done');
    expect(text).toContain('data:');
    expect(text).toContain('event: thread');
    expect(text).toMatch(/event: meta[\s\S]*"cached":\s*false/);
  });

  it('400 on missing topic', async () => {
    const res = await fetch(`${srv.url}/api/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('writes cache file after successful synthesis', async () => {
    const res = await fetch(`${srv.url}/api/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'RAG' }),
    });
    expect(res.status).toBe(200);
    await res.text();
    const fs = await import('node:fs');
    const path = join(srv.dataDir, 'synthesis', 'rag.json');
    expect(fs.existsSync(path)).toBe(true);
  });

  it('second call returns cached result (cached: true in meta event)', async () => {
    await fetch(`${srv.url}/api/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'RAG' }),
    }).then((r) => r.text());

    const res = await fetch(`${srv.url}/api/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'RAG' }),
    });
    const text = await res.text();
    expect(text).toMatch(/event: meta[\s\S]*"cached":\s*true/);
  });

  it('force:true bypasses cache and returns cached:false in meta', async () => {
    // First call — populate cache
    await fetch(`${srv.url}/api/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'RAG' }),
    }).then((r) => r.text());

    // Second call with force:true — must bypass cache
    const res = await fetch(`${srv.url}/api/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'RAG', force: true }),
    });
    const text = await res.text();
    expect(text).toMatch(/event: meta[\s\S]*"cached":\s*false/);
  });
});
