import { Router } from 'express';
import { createAdapter } from '@mindbase/core';
import type { ServerContext } from '../context';
import type { AtlasConfig } from '../config';

export function configRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(ctx.config);
  });

  router.put('/', async (req, res) => {
    try {
      const newConfig = req.body as AtlasConfig;
      await ctx.saveConfig(newConfig);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  router.post('/test', async (req, res) => {
    try {
      const { provider, apiKey, model, baseUrl } = req.body as AtlasConfig;
      const adapter = createAdapter(provider, { apiKey, model, baseUrl: baseUrl || undefined });
      const result = await adapter.testConnection();
      res.json(result);
    } catch (e) {
      res.json({ ok: false, error: (e as Error).message });
    }
  });

  return router;
}
