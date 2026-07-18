import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createContext } from '../../../context.js';
import { treeRoutes } from '../index.js';

describe('tree list routes', () => {
  let dataDir: string;
  let app: express.Application;

  beforeEach(async () => {
    dataDir = join(tmpdir(), `tree-list-test-${Date.now()}`);
    const proj = join(dataDir, 'projects', 'test-proj');
    await mkdir(join(proj, 'sources', 'contributors', 'alice'), { recursive: true });
    await mkdir(join(proj, 'sources', 'research'), { recursive: true });
    await mkdir(join(proj, 'logs'), { recursive: true });
    await writeFile(join(proj, 'README.md'), '# test');
    await writeFile(join(proj, 'context.md'), '# ctx');
    await writeFile(join(proj, 'index.yaml'), 'project:\n  id: test-proj\n');
    await writeFile(join(proj, 'sources', 'contributors', 'alice', '2026-06-09.md'), 'hi');
    await writeFile(join(proj, 'sources', 'research', 'rag.md'), 'notes');
    await writeFile(join(proj, 'logs', '2026-06-09.md'), 'log');
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({ currentProjectId: 'test-proj' }));

    const ctx = await createContext(dataDir);
    app = express();
    app.use(express.json());
    app.use('/api/tree', treeRoutes(ctx));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('GET / returns category summary', async () => {
    const res = await request(app).get('/api/tree');
    expect(res.status).toBe(200);
    const ids = res.body.categories.map((c: { id: string }) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['readme', 'context', 'contributors', 'research', 'logs']));
    const contributors = res.body.categories.find((c: { id: string }) => c.id === 'contributors');
    expect(contributors.count).toBe(1);
    expect(contributors.users[0].name).toBe('alice');
  });

  it('GET /contributors returns users grouping', async () => {
    const res = await request(app).get('/api/tree/contributors');
    expect(res.status).toBe(200);
    expect(res.body.users.alice[0].date).toBe('2026-06-09');
  });

  it('GET /research returns flat file list', async () => {
    const res = await request(app).get('/api/tree/research');
    expect(res.status).toBe(200);
    expect(res.body.files.map((f: { slug: string }) => f.slug)).toContain('rag');
  });

  it('GET /logs returns days array', async () => {
    const res = await request(app).get('/api/tree/logs');
    expect(res.status).toBe(200);
    expect(res.body.days).toContain('2026-06-09');
  });
});
