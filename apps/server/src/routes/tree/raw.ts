import { Router } from 'express';
import { createReadStream } from 'node:fs';
import { readdir as readdirP, readFile as readFileP, stat as statP } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerContext } from '../../context.js';
import { projectPaths } from '@mindbase/core';
import { projectRoot as makeProjectRoot, detectLayoutVersion } from '../../context.js';
import { BINARY_EXTS } from '../../lib/binary-probe.js';

export function rawTreeRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/raw', async (_req, res) => {
    const projectId = ctx.currentProjectId;
    const layout = await detectLayoutVersion(makeProjectRoot(ctx.dataDir, projectId));
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED' });
    const p = projectPaths();
    const root = join(ctx.dataDir, 'projects', projectId, p.rawDir);
    const entries: Array<{ date: string; id: string; size: number; kind: string }> = [];
    try {
      const dates = await readdirP(root);
      for (const date of dates) {
        try {
          const files = await readdirP(join(root, date));
          for (const id of files) {
            const s = await statP(join(root, date, id));
            const ext = (id.split('.').pop() ?? '').toLowerCase();
            entries.push({ date, id, size: s.size, kind: (BINARY_EXTS as readonly string[]).includes(ext) ? 'binary' : 'text' });
          }
        } catch { /* skip */ }
      }
    } catch { /* ok */ }
    return res.json({ category: 'raw', entries });
  });

  router.get('/raw/:date/:id', async (req, res) => {
    const projectId = ctx.currentProjectId;
    const layout = await detectLayoutVersion(makeProjectRoot(ctx.dataDir, projectId));
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED' });
    const p = projectPaths();
    const abs = join(ctx.dataDir, 'projects', projectId, p.rawDir, req.params.date, req.params.id);
    try {
      const body = await readFileP(abs, 'utf-8');
      return res.json({ date: req.params.date, id: req.params.id, body });
    } catch { return res.status(404).json({ error: 'Not found' }); }
  });

  router.get('/raw/:date/:id/binary', (req, res) => {
    const projectId = ctx.currentProjectId;
    const p = projectPaths();
    const abs = join(ctx.dataDir, 'projects', projectId, p.rawDir, req.params.date, req.params.id);
    const stream = createReadStream(abs);
    stream.on('error', () => res.status(404).end());
    stream.pipe(res);
  });

  return router;
}
