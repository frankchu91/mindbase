import { Router } from 'express';
import type { ServerContext } from '../context';
import type { AnalysisScheduler } from '../lib/analysis-scheduler';
import { runAnalysis } from '@mindbase/core';

export function analysisRoutes(ctx: ServerContext, scheduler: AnalysisScheduler): Router {
  const router = Router();

  router.get('/insights', async (_req, res) => {
    try {
      const insights = await runAnalysis({ store: ctx.store, wikiIndex: ctx.wikiIndex });
      res.json({ insights });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/recompute', async (_req, res) => {
    try {
      await scheduler.runNow();
      const probeResult = await scheduler.runProbeNow();
      res.json({ ok: true, probe: probeResult });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
