import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createContext } from '../../../context.js';
import { treeRoutes } from '../index.js';

describe('tree crud routes', () => {
  let dataDir: string;
  let app: express.Application;

  beforeEach(async () => {
    dataDir = join(tmpdir(), `tree-crud-test-${Date.now()}`);
    const proj = join(dataDir, 'projects', 'p');
    await mkdir(join(proj, 'sources', 'contributors', 'haobing'), { recursive: true });
    await mkdir(join(proj, 'sources', 'research'), { recursive: true });
    await writeFile(join(proj, 'README.md'), '# proj');
    await writeFile(join(proj, 'context.md'), '# ctx');
    await writeFile(join(proj, 'index.yaml'), 'project:\n  id: p\n');
    await writeFile(join(proj, 'sources', 'contributors', 'haobing', '2026-06-09.md'), 'hello');
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({ currentProjectId: 'p' }));
    const ctx = await createContext(dataDir);
    app = express();
    app.use(express.json());
    app.use('/api/tree', treeRoutes(ctx));
  });

  afterEach(async () => { await rm(dataDir, { recursive: true, force: true }); });

  it('GET reads contributor file', async () => {
    const res = await request(app).get('/api/tree/contributors/haobing/2026-06-09.md');
    expect(res.status).toBe(200);
    expect(res.body.body).toContain('hello');
  });

  it('PUT writes research file', async () => {
    const res = await request(app)
      .put('/api/tree/research/rag.md')
      .set('x-mindbase-user', 'alice')
      .send({ body: '# RAG notes' });
    expect(res.status).toBe(200);
    const disk = await readFile(join(dataDir, 'projects', 'p', 'sources', 'research', 'rag.md'), 'utf-8');
    expect(disk).toContain('RAG notes');
  });

  it('PUT writes contributor day using x-mindbase-user header', async () => {
    const res = await request(app)
      .put('/api/tree/contributors/2026-06-10.md')
      .set('x-mindbase-user', 'alice')
      .send({ body: 'alice entry' });
    expect(res.status).toBe(200);
    const disk = await readFile(join(dataDir, 'projects', 'p', 'sources', 'contributors', 'alice', '2026-06-10.md'), 'utf-8');
    expect(disk).toContain('alice entry');
  });

  it('DELETE removes contributor file', async () => {
    const res = await request(app).delete('/api/tree/contributors/haobing/2026-06-09.md');
    expect([200, 204]).toContain(res.status);
    const gone = await readFile(join(dataDir, 'projects', 'p', 'sources', 'contributors', 'haobing', '2026-06-09.md'), 'utf-8').catch(() => null);
    expect(gone).toBeNull();
  });
});
