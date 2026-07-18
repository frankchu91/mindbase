import { Router } from 'express';
import type { ServerContext } from '../context';
import { generateAndWriteInsights, readCachedInsights, isFresh } from '../lib/wiki-health';

export function insightsRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const force = req.query['refresh'] === 'true' || req.query['refresh'] === '1';
      if (!force) {
        const cached = await readCachedInsights(ctx);
        if (cached && isFresh(cached)) {
          res.json(cached);
          return;
        }
      }
      const fresh = await generateAndWriteInsights(ctx);
      res.json(fresh);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
