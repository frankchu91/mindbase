/**
 * attachments-e2e.test.ts
 *
 * E2E tests for the image attachment upload endpoint:
 *   POST /api/wiki/attachments/:slug
 *   GET  /api/wiki/attachments/:slug/:filename (static serve)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createContext } from '../src/context';
import { attachmentsRoutes } from '../src/routes/attachments';

// Minimal test server that only mounts the attachments route
async function bootAttachmentsServer(): Promise<{ url: string; dataDir: string; close: () => Promise<void> }> {
  const dataDir = mkdtempSync(join(tmpdir(), 'mb-attachments-'));

  const ctx = await createContext(dataDir);

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // POST handler must come before static so it isn't shadowed
  app.use('/api/wiki/attachments', attachmentsRoutes(ctx));
  app.use('/api/wiki/attachments', express.static(join(dataDir, 'attachments')));

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address() as { port: number };
  const url = `http://localhost:${address.port}`;

  return {
    url,
    dataDir,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          rmSync(dataDir, { recursive: true, force: true });
          resolve();
        });
      }),
  };
}

// Minimal 1×1 transparent PNG (valid binary)
const MINIMAL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex',
);

let srv: Awaited<ReturnType<typeof bootAttachmentsServer>>;

beforeAll(async () => {
  srv = await bootAttachmentsServer();
});

afterAll(async () => {
  await srv.close();
});

describe('Attachments API E2E', () => {
  let uploadedUrl = '';
  let uploadedPath = '';

  it('POST /api/wiki/attachments/:slug → 200 with path and url', async () => {
    const form = new FormData();
    const blob = new Blob([MINIMAL_PNG], { type: 'image/png' });
    form.append('file', blob, 'test-image.png');

    const res = await fetch(`${srv.url}/api/wiki/attachments/test-page`, {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string; url: string };
    expect(body.path).toMatch(/^attachments\/test-page\/.+\.png$/);
    expect(body.url).toMatch(/^\/api\/wiki\/attachments\/test-page\/.+\.png$/);

    uploadedUrl = body.url;
    uploadedPath = body.path;
  });

  it('uploaded file is stored on disk', () => {
    expect(uploadedPath).toBeTruthy();
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    const diskPath = join(srv.dataDir, uploadedPath);
    expect(existsSync(diskPath)).toBe(true);
  });

  it('GET /api/wiki/attachments/:slug/:filename → serves the file', async () => {
    expect(uploadedUrl).toBeTruthy();
    const res = await fetch(`${srv.url}${uploadedUrl}`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('image/png');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
  });

  it('POST with invalid slug → 400', async () => {
    const form = new FormData();
    const blob = new Blob([MINIMAL_PNG], { type: 'image/png' });
    form.append('file', blob, 'test.png');

    const res = await fetch(`${srv.url}/api/wiki/attachments/../../../etc/passwd`, {
      method: 'POST',
      body: form,
    });
    // Express normalizes path traversal, but the slug check should still reject
    expect([400, 404]).toContain(res.status);
  });

  it('POST with unsupported extension → 400', async () => {
    const form = new FormData();
    const blob = new Blob([Buffer.from('exec()'), { type: 'application/x-sh' }], { type: 'application/x-sh' });
    form.append('file', blob, 'malicious.sh');

    const res = await fetch(`${srv.url}/api/wiki/attachments/test-page`, {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/unsupported extension/i);
  });

  it('POST with no file → 400', async () => {
    const form = new FormData();
    const res = await fetch(`${srv.url}/api/wiki/attachments/test-page`, {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it('deduplication: uploading same file twice returns same hash filename', async () => {
    const upload = async () => {
      const form = new FormData();
      const blob = new Blob([MINIMAL_PNG], { type: 'image/png' });
      form.append('file', blob, 'dup.png');
      const res = await fetch(`${srv.url}/api/wiki/attachments/dedup-page`, {
        method: 'POST',
        body: form,
      });
      return (await res.json()) as { path: string; url: string };
    };

    const [a, b] = await Promise.all([upload(), upload()]);
    expect(a.path).toBe(b.path);
  });
});
