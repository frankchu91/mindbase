import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ServerContext } from '../context';

const ALLOWED_FILES = new Set(['ingest.md', 'query.md', 'lint.md', 'conventions.md', 'synthesis.md']);
const REPO_SCHEMA_DIR = path.resolve(import.meta.dirname, '../../../../schema');

function safe(file: string): boolean {
  return ALLOWED_FILES.has(file);
}

export function schemaRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const files = await Promise.all(
      Array.from(ALLOWED_FILES).sort().map(async (file) => {
        let userContent = '';
        let defaultContent = '';
        try { userContent = await ctx.store.readText(`schema/${file}`); } catch { /* not yet present */ }
        try { defaultContent = await fs.readFile(path.join(REPO_SCHEMA_DIR, file), 'utf-8'); } catch { /* should never happen */ }
        return { file, modified: userContent !== defaultContent };
      }),
    );
    res.json({ files });
  });

  router.get('/:file', async (req, res) => {
    const file = req.params['file']!;
    if (!safe(file)) { res.status(400).json({ error: 'invalid schema file' }); return; }
    try {
      const content = await ctx.store.readText(`schema/${file}`);
      res.json({ file, content });
    } catch {
      res.status(404).json({ error: 'not found' });
    }
  });

  router.put('/:file', async (req, res) => {
    const file = req.params['file']!;
    if (!safe(file)) { res.status(400).json({ error: 'invalid schema file' }); return; }
    const content = (req.body as { content?: string })?.content;
    if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
    await ctx.store.writeText(`schema/${file}`, content);
    res.json({ ok: true });
  });

  router.post('/:file/reset', async (req, res) => {
    const file = req.params['file']!;
    if (!safe(file)) { res.status(400).json({ error: 'invalid schema file' }); return; }
    try {
      const defaultContent = await fs.readFile(path.join(REPO_SCHEMA_DIR, file), 'utf-8');
      await ctx.store.writeText(`schema/${file}`, defaultContent);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
