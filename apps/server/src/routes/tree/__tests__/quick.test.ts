import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createContext } from '../../../context.js';
import { treeRoutes } from '../index.js';

describe('tree quick routes', () => {
  let dataDir: string;
  let app: express.Application;

  beforeEach(async () => {
    dataDir = join(tmpdir(), `tree-quick-test-${Date.now()}`);
    const proj = join(dataDir, 'projects', 'q');
    await mkdir(join(proj, 'sources', 'contributors'), { recursive: true });
    await mkdir(join(proj, 'sources', 'research'), { recursive: true });
    await writeFile(join(proj, 'README.md'), '# q');
    await writeFile(join(proj, 'context.md'), '# ctx');
    await writeFile(join(proj, 'index.yaml'), 'project:\n  id: q\n');
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({ currentProjectId: 'q' }));
    const ctx = await createContext(dataDir);
    app = express();
    app.use(express.json());
    app.use('/api/tree', treeRoutes(ctx));
  });

  afterEach(async () => { await rm(dataDir, { recursive: true, force: true }); });

  it('POST /contributors/daily appends to today file', async () => {
    const res = await request(app)
      .post('/api/tree/contributors/daily')
      .set('x-mindbase-user', 'alice')
      .send({ text: 'hello world' });
    expect(res.status).toBe(200);
    const today = new Date().toISOString().slice(0, 10);
    const disk = await readFile(join(dataDir, 'projects', 'q', 'sources', 'contributors', 'alice', `${today}.md`), 'utf-8');
    expect(disk).toContain('hello world');
  });

  it('POST /research creates a new page', async () => {
    const res = await request(app)
      .post('/api/tree/research')
      .send({ slug: 'transformer-basics', title: 'Transformer Basics', body: '# TB\n\nBody' });
    expect(res.status).toBe(200);
    const disk = await readFile(join(dataDir, 'projects', 'q', 'sources', 'research', 'transformer-basics.md'), 'utf-8');
    expect(disk).toContain('Transformer Basics');
  });
});
