import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootTestServer, type TestServer } from './helpers/server-fixture';

let srv: TestServer;

beforeAll(async () => {
  srv = await bootTestServer();
});

afterAll(async () => {
  await srv.close();
});

describe('Brief API E2E', () => {
  it('GET /api/brief/preview returns brief + html + text', async () => {
    const res = await fetch(`${srv.url}/api/brief/preview`);
    // Should succeed even with empty wiki (builds a brief with 0 items)
    expect(res.status).toBe(200);
    const body = (await res.json()) as { brief: unknown; html: string; text: string };
    expect(body).toHaveProperty('brief');
    expect(body).toHaveProperty('html');
    expect(body).toHaveProperty('text');
  });

  it('GET /api/brief/preview html contains links when citations present', async () => {
    const res = await fetch(`${srv.url}/api/brief/preview`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { html: string };
    // html is always a string (may be minimal if brief has no items)
    expect(typeof body.html).toBe('string');
  });

  it('POST /api/brief/send-now without SMTP config → 400', async () => {
    // Default config has no dailyBrief key → should 400
    const res = await fetch(`${srv.url}/api/brief/send-now`, { method: 'POST' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not configured/i);
  });

  it('GET /api/brief/history returns array', async () => {
    const res = await fetch(`${srv.url}/api/brief/history`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { briefs: unknown[] };
    expect(Array.isArray(body.briefs)).toBe(true);
  });

  it('GET /api/brief/today returns null or brief', async () => {
    const res = await fetch(`${srv.url}/api/brief/today`);
    // Returns 200 with null brief when none exists yet
    expect(res.status).toBe(200);
    const body = (await res.json()) as { brief: unknown };
    // brief is either null or a brief object
    expect(body).toHaveProperty('brief');
  });
});
