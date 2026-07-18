import { Router } from 'express';
import type { ServerContext } from '../context';
import type { BriefScheduler } from '../lib/brief-scheduler';
import {
  buildBriefFromServer,
  sendBrief,
  renderBriefHtml,
  renderBriefText,
  persistBrief,
  readBrief,
  listBriefs,
} from '../lib/brief';

export function briefRoutes(ctx: ServerContext, scheduler: BriefScheduler): Router {
  const router = Router();

  /** GET /api/brief/preview — generate without sending */
  router.get('/preview', async (_req, res) => {
    try {
      const brief = await buildBriefFromServer(ctx, {
        includeOnThisDay: ctx.config.dailyBrief?.includeOnThisDay ?? false,
        includeQuiz: ctx.config.dailyBrief?.includeQuiz ?? false,
      });
      const publicUrl = ctx.config.dailyBrief?.publicUrl ?? 'http://localhost:4321';
      res.json({
        brief,
        html: renderBriefHtml(brief, publicUrl),
        text: renderBriefText(brief, publicUrl),
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  /** POST /api/brief/send-now — generate + email immediately */
  router.post('/send-now', async (_req, res) => {
    const cfg = ctx.config.dailyBrief;
    if (!cfg) {
      res.status(400).json({ error: 'Daily Brief not configured' });
      return;
    }
    try {
      const brief = await buildBriefFromServer(ctx, {
        includeOnThisDay: cfg.includeOnThisDay,
        includeQuiz: cfg.includeQuiz,
      });
      const { messageId } = await sendBrief(brief, cfg);
      brief.status = 'sent';
      brief.message_id = messageId;
      await persistBrief(ctx.dataDir, brief);
      res.json({ ok: true, messageId });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  /** GET /api/brief/history — list all brief run records */
  router.get('/history', async (_req, res) => {
    const briefs = await listBriefs(ctx.dataDir);
    res.json({ briefs });
  });

  /** GET /api/brief/today — has today's brief been generated? */
  router.get('/today', async (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const brief = await readBrief(ctx.dataDir, today);
    res.json({ exists: !!brief, brief });
  });

  return router;
}
