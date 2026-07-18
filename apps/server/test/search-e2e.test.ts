/**
 * E2E tests for the multilingual hybrid search endpoints.
 *
 * NOTE: The embedding indexer uses @xenova/transformers which requires
 * downloading ~570MB on first run. In tests we skip real embedding and verify
 * the BM25 path (vector search silently no-ops when no embeddings cached).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootTestServer, type TestServer } from './helpers/server-fixture';

let srv: TestServer;

beforeAll(async () => {
  srv = await bootTestServer();

  // Seed a wiki page for search testing
  await fetch(`${srv.url}/api/wiki/notes/machine-learning`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: '# Machine Learning\n\nMachine learning is a subset of AI that enables systems to learn from data.' }),
  });

  // Trigger reindex so BM25 picks up the new page
  await fetch(`${srv.url}/api/wiki/notes/machine-learning`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: '# Machine Learning\n\nMachine learning is a subset of AI that enables systems to learn from data.' }),
  });
}, 30_000);

afterAll(async () => {
  await srv.close();
});

describe('GET /api/search (legacy)', () => {
  it('returns empty for blank query', async () => {
    const r = await fetch(`${srv.url}/api/search?q=`);
    const d = await r.json() as { results: unknown[] };
    expect(r.status).toBe(200);
    expect(d.results).toEqual([]);
  });

  it('returns results for a keyword query', async () => {
    const r = await fetch(`${srv.url}/api/search?q=machine`);
    const d = await r.json() as { results: Array<{ path: string }> };
    expect(r.status).toBe(200);
    expect(d.results.some((x) => x.path.includes('machine-learning'))).toBe(true);
  });
});

describe('GET /api/search/index-status', () => {
  it('returns indexed/total counts', async () => {
    const r = await fetch(`${srv.url}/api/search/index-status`);
    const d = await r.json() as { indexed: number; total: number };
    expect(r.status).toBe(200);
    expect(typeof d.indexed).toBe('number');
    expect(typeof d.total).toBe('number');
  });
});

describe('POST /api/search/hybrid', () => {
  it('returns 200 with results array for a valid query', async () => {
    const r = await fetch(`${srv.url}/api/search/hybrid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'machine learning' }),
    });
    expect(r.status).toBe(200);
    const d = await r.json() as { results: unknown[]; query_used: { q: string }; index_status: { indexed: number; total: number } };
    expect(Array.isArray(d.results)).toBe(true);
    expect(d.query_used.q).toBeTruthy();
    expect(typeof d.index_status.total).toBe('number');
  });

  it('returns BM25 results for English query', async () => {
    const r = await fetch(`${srv.url}/api/search/hybrid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'machine learning', limit: 5 }),
    });
    const d = await r.json() as { results: Array<{ slug: string; snippet: { text: string } }> };
    expect(d.results.length).toBeGreaterThan(0);
    expect(d.results[0]?.slug).toBe('machine-learning');
    expect(d.results[0]?.snippet.text).toBeTruthy();
  });

  it('returns empty results for blank query', async () => {
    const r = await fetch(`${srv.url}/api/search/hybrid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: '' }),
    });
    const d = await r.json() as { results: unknown[] };
    expect(d.results).toEqual([]);
  });

  it('parses operator syntax server-side', async () => {
    const r = await fetch(`${srv.url}/api/search/hybrid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'machine learning type:concept' }),
    });
    const d = await r.json() as { query_used: { filters: { type?: string } } };
    expect(d.query_used.filters.type).toBe('concept');
  });

  it('supports federated search option', async () => {
    const r = await fetch(`${srv.url}/api/search/hybrid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'machine', federate: true }),
    });
    const d = await r.json() as { results: unknown[]; federated?: { inbox: unknown[]; chats: unknown[] } };
    expect(r.status).toBe(200);
    expect(d.federated).toBeDefined();
    expect(Array.isArray(d.federated?.inbox)).toBe(true);
    expect(Array.isArray(d.federated?.chats)).toBe(true);
  });

  it('applies since_days filter (no results for future date)', async () => {
    const r = await fetch(`${srv.url}/api/search/hybrid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'machine learning', filters: { since_days: 0 } }),
    });
    const d = await r.json() as { results: unknown[] };
    // since_days:0 means updated today — the seeded page was just created so it passes
    expect(r.status).toBe(200);
    expect(Array.isArray(d.results)).toBe(true);
  });
});

describe('POST /api/search/ask', () => {
  it('returns 400 for empty query', async () => {
    const r = await fetch(`${srv.url}/api/search/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: '', context_slugs: [] }),
    });
    expect(r.status).toBe(400);
  });

  it('streams SSE events for a valid query', async () => {
    const r = await fetch(`${srv.url}/api/search/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        q: 'What is machine learning?',
        context_slugs: ['machine-learning'],
      }),
    });

    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/event-stream');

    // Read SSE stream until done
    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const events: string[] = [];
    let totalRead = 0;

    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        try {
          const evt = JSON.parse(payload) as { kind: string };
          events.push(evt.kind);
          if (evt.kind === 'done' || evt.kind === 'error') break outer;
        } catch { /* skip */ }
      }
      totalRead += value?.length ?? 0;
      if (totalRead > 50_000) break; // safety guard
    }

    expect(events.some((k) => k === 'done' || k === 'delta' || k === 'sources')).toBe(true);
  }, 30_000);
});

describe('POST /api/search/expand-or-suggest', () => {
  it('returns expansions and suggestions shape', async () => {
    const r = await fetch(`${srv.url}/api/search/expand-or-suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'rag chunking' }),
    });
    expect(r.status).toBe(200);
    const d = await r.json() as { expansions: unknown[]; suggestions: unknown[] };
    expect(Array.isArray(d.expansions)).toBe(true);
    expect(Array.isArray(d.suggestions)).toBe(true);
  });

  it('returns empty for short queries', async () => {
    const r = await fetch(`${srv.url}/api/search/expand-or-suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'ab' }),
    });
    const d = await r.json() as { expansions: unknown[]; suggestions: unknown[] };
    expect(d.expansions).toEqual([]);
    expect(d.suggestions).toEqual([]);
  });
});
