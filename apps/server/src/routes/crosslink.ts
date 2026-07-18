import { Router } from 'express';
import { runCrosslinker } from '@mindbase/core/src/compile/crosslink';
import type { ServerContext } from '../context';

export function crosslinkRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.post('/', async (_req, res) => {
    try {
      const result = await runCrosslinker(ctx.store);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  return router;
}
