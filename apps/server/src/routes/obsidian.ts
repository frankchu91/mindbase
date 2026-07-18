import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildColorGroups, mergeIntoGraphJson } from '@mindbase/core';
import type { ColorizeMode } from '@mindbase/core';
import type { ServerContext } from '../context';

export function obsidianRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.post('/colorize', async (req, res) => {
    const { mode } = req.body as { mode: ColorizeMode };
    if (!mode || !['by-tag', 'by-category', 'by-visibility'].includes(mode)) {
      res.status(400).json({ error: 'mode must be by-tag | by-category | by-visibility' });
      return;
    }
    try {
      const graph = ctx.wikiIndex.buildGraph();
      const groups = buildColorGroups(graph, mode);

      const obsidianDir = path.join(ctx.dataDir, '.obsidian');
      const graphJsonPath = path.join(obsidianDir, 'graph.json');

      // Read existing if present
      let existing: string | null = null;
      try { existing = await fs.readFile(graphJsonPath, 'utf-8'); } catch { /* doesn't exist */ }

      // Backup existing
      if (existing) {
        await fs.writeFile(`${graphJsonPath}.backup-${Date.now()}`, existing, 'utf-8');
      }

      // Ensure directory
      await fs.mkdir(obsidianDir, { recursive: true });

      // Write merged
      const merged = mergeIntoGraphJson(existing, groups);
      await fs.writeFile(graphJsonPath, merged, 'utf-8');

      res.json({ ok: true, mode, groups: groups.length, path: graphJsonPath });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
