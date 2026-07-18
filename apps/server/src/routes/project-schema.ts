// apps/server/src/routes/project-schema.ts
import { Router } from 'express';
import type { ServerContext } from '../context';

export function projectSchemaRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const body = await ctx.store.readText('wiki/schema.md').catch(() => '');
      res.json({ content: body });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.put('/', async (req, res) => {
    try {
      const { content } = req.body as { content?: string };
      if (typeof content !== 'string') {
        res.status(400).json({ error: 'content required' });
        return;
      }
      if (content.length > 50_000) {
        res.status(413).json({ error: 'schema too long (max 50KB)' });
        return;
      }
      await ctx.store.writeText('wiki/schema.md', content);
      res.json({ ok: true, size: content.length });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
