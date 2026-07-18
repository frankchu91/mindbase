import { Router } from 'express';
import type { ServerContext } from '../context';
import { runCuration } from '../lib/curation';

export function pulseRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const date = (req.query['date'] as string) ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      return;
    }

    try {
      if (!req.query['refresh']) {
        const cached = await ctx.synthesisCache.readPulse(date);
        if (cached) {
          res.json(cached);
          return;
        }
      }
      const result = await runCuration(ctx, date);
      await ctx.synthesisCache.writePulse(date, result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
