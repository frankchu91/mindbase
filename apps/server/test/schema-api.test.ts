import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootTestServer, type TestServer } from './helpers/server-fixture';

let srv: TestServer;
beforeAll(async () => { srv = await bootTestServer(); });
afterAll(async () => { await srv.close(); });

describe('Schema API', () => {
  it('GET /api/schema lists all schema files', async () => {
    const res = await fetch(`${srv.url}/api/schema`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: Array<{ file: string; modified: boolean }> };
    const names = body.files.map((f) => f.file);
    expect(names).toContain('ingest.md');
    expect(names).toContain('synthesis.md');
    expect(names.length).toBe(5);
  });

  it('GET /api/schema/:file returns raw text', async () => {
    const res = await fetch(`${srv.url}/api/schema/ingest.md`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string };
    expect(body.content).toContain('Ingest Instructions');
  });

  it('PUT /api/schema/:file writes the file', async () => {
    const put = await fetch(`${srv.url}/api/schema/synthesis.md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# Custom preamble\n\nTest write.' }),
    });
    expect(put.status).toBe(200);
    const get = await fetch(`${srv.url}/api/schema/synthesis.md`);
    const body = (await get.json()) as { content: string };
    expect(body.content).toBe('# Custom preamble\n\nTest write.');
  });

  it('POST /api/schema/:file/reset restores the repo default', async () => {
    await fetch(`${srv.url}/api/schema/synthesis.md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'modified' }),
    });
    const reset = await fetch(`${srv.url}/api/schema/synthesis.md/reset`, { method: 'POST' });
    expect(reset.status).toBe(200);
    const get = await fetch(`${srv.url}/api/schema/synthesis.md`);
    const body = (await get.json()) as { content: string };
    expect(body.content).not.toBe('modified');
    expect(body.content).toContain('Active Wiki Engine Preamble');
  });

  it('rejects invalid filename', async () => {
    const res = await fetch(`${srv.url}/api/schema/../passwd`);
    expect([400, 404]).toContain(res.status);
  });
});
