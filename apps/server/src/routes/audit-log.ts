import { Router } from 'express';
import type { ServerContext } from '../context';

export function auditLogRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const limit = Math.min(parseInt((req.query['limit'] as string) ?? '50', 10) || 50, 200);
      const entries = ctx.wikiIndex.auditLog().listRecent(limit);
      res.json({ entries });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const id = parseInt(req.params['id']!, 10);
      const entry = ctx.wikiIndex.auditLog().getById(id);
      if (!entry) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json({ entry });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
