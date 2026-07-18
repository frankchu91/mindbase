import { Router } from 'express';
import type { ServerContext } from '../context';
import { runNetwork } from '../lib/network';
import { isValidSlug } from '../safe-path';

export function networkRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/:slug', async (req, res) => {
    const slug = req.params['slug'] ?? '';
    if (!isValidSlug(slug)) {
      res.status(400).json({ error: 'invalid slug' });
      return;
    }

    try {
      const cached = await ctx.synthesisCache.readNetwork(slug);
      if (cached && !req.query['refresh']) {
        res.json(cached);
        return;
      }
      const result = await runNetwork(ctx, slug);
      await ctx.synthesisCache.writeNetwork(slug, result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
