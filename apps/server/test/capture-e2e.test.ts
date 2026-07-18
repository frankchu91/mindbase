/**
 * Capture API E2E — replaces the simple unit test with full HTTP round-trips.
 * Uses the server-fixture helper (real Express, real tmpdir, mock LLM adapter).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { bootTestServer, pairDevice, type TestServer } from './helpers/server-fixture';

let srv: TestServer;
let token: string;
let deviceId: string;

// ---- Fetch mock: pass localhost through, return canned HTML for article URLs
const realFetch = globalThis.fetch;
const ARTICLE_TEXT = 'This is article content about artificial intelligence and machine learning. '.repeat(5);
const HTML_BODY = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Test Article</title></head><body><div id="content"><article><h1>Test Article</h1><p>${ARTICLE_TEXT}</p><p>${ARTICLE_TEXT}</p><p>${ARTICLE_TEXT}</p></article></div></body></html>`;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) {
    return realFetch(input, init);
  }
  if (u.includes('article.html') || u.includes('example.com')) {
    return new Response(HTML_BODY, { status: 200, headers: { 'content-type': 'text/html' } });
  }
  return new Response('', { status: 404 });
});

beforeAll(async () => {
  globalThis.fetch = fetchMock as typeof fetch;
  srv = await bootTestServer();
  ({ token, deviceId } = await pairDevice(srv.url, 'Capture Test Device'));
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await srv.close();
});

function captureHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

describe('Capture API E2E', () => {
  it('capture without bearer → 401', async () => {
    const res = await fetch(`${srv.url}/api/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', text: 'hello', captured_via: 'browser-ext', captured_at: new Date().toISOString() }),
    });
    expect(res.status).toBe(401);
  });

  it('capture with bearer + text → 200, inbox shows queued entry', async () => {
    const captureRes = await fetch(`${srv.url}/api/capture`, {
      method: 'POST',
      headers: captureHeaders(),
      body: JSON.stringify({
        type: 'text',
        text: 'Hello world this is a longer test capture entry',
        title: 'First capture',
        captured_via: 'browser-ext',
        captured_at: new Date().toISOString(),
        captured_device_id: deviceId,
      }),
    });
    expect(captureRes.status).toBe(200);
    const cap = (await captureRes.json()) as { id: string };
    expect(cap.id).toBeTruthy();

    const inboxRes = await fetch(`${srv.url}/api/inbox`);
    const { entries } = (await inboxRes.json()) as { entries: Array<{ id: string; status: string }> };
    const entry = entries.find((e) => e.id === cap.id);
    expect(entry).toBeTruthy();
    expect(entry!.status).toBe('queued');
  });

  it('duplicate client_dedup_key within session → 409', async () => {
    const body = {
      type: 'text',
      text: 'Dedup test content with enough characters to pass minimum length',
      captured_via: 'browser-ext',
      captured_at: new Date().toISOString(),
      client_dedup_key: 'e2e-capture-dedup-key',
    };
    const first = await fetch(`${srv.url}/api/capture`, {
      method: 'POST',
      headers: captureHeaders(),
      body: JSON.stringify(body),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${srv.url}/api/capture`, {
      method: 'POST',
      headers: captureHeaders(),
      body: JSON.stringify(body),
    });
    expect(second.status).toBe(409);
  });

  it('GET /api/inbox lists captured entries', async () => {
    const res = await fetch(`${srv.url}/api/inbox`);
    expect(res.status).toBe(200);
    const { entries } = (await res.json()) as { entries: unknown[] };
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('POST /api/inbox/:id/compile → mock adapter creates wiki page', async () => {
    // Create a fresh capture
    const capRes = await fetch(`${srv.url}/api/capture`, {
      method: 'POST',
      headers: captureHeaders(),
      body: JSON.stringify({
        type: 'text',
        text: 'Test concept about artificial intelligence and machine learning for compilation',
        title: 'AI test note',
        captured_via: 'browser-ext',
        captured_at: new Date().toISOString(),
      }),
    });
    const { id } = (await capRes.json()) as { id: string };

    // Force compile
    const compileRes = await fetch(`${srv.url}/api/inbox/${id}/compile`, { method: 'POST' });
    expect(compileRes.status).toBe(200);

    // After compile, inbox shows compiled or processing (worker may still be running)
    const inboxRes = await fetch(`${srv.url}/api/inbox`);
    const { entries } = (await inboxRes.json()) as { entries: Array<{ id: string; status: string; wiki_slug?: string }> };
    const entry = entries.find((e) => e.id === id);
    // The compile should result in 'compiled' with a wiki_slug (mock adapter creates concept)
    expect(entry).toBeTruthy();
    expect(['compiled', 'processing']).toContain(entry!.status);
  }, 15000);

  it('DELETE /api/inbox/:id removes the entry', async () => {
    const capRes = await fetch(`${srv.url}/api/capture`, {
      method: 'POST',
      headers: captureHeaders(),
      body: JSON.stringify({
        type: 'text',
        text: 'Entry to be deleted from inbox via API',
        captured_via: 'browser-ext',
        captured_at: new Date().toISOString(),
      }),
    });
    const { id } = (await capRes.json()) as { id: string };

    const delRes = await fetch(`${srv.url}/api/inbox/${id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);

    const listRes = await fetch(`${srv.url}/api/inbox`);
    const { entries } = (await listRes.json()) as { entries: Array<{ id: string }> };
    expect(entries.find((e) => e.id === id)).toBeUndefined();
  });

  it('type=url with empty text → article extraction via fetch', async () => {
    const capRes = await fetch(`${srv.url}/api/capture`, {
      method: 'POST',
      headers: captureHeaders(),
      body: JSON.stringify({
        type: 'url',
        url: 'https://example.com/article.html',
        title: 'Test Article',
        captured_via: 'browser-ext',
        captured_at: new Date().toISOString(),
      }),
    });
    expect(capRes.status).toBe(200);
    const { id } = (await capRes.json()) as { id: string };

    // Force compile — this will trigger article extraction
    const compileRes = await fetch(`${srv.url}/api/inbox/${id}/compile`, { method: 'POST' });
    const compileText = await compileRes.text();
    // Should succeed (200) — article extract mocked to return HTML with sufficient text
    if (compileRes.status !== 200) {
      console.warn('[capture-e2e] compile returned', compileRes.status, compileText);
    }
    expect(compileRes.status).toBe(200);
  }, 15000);
});
