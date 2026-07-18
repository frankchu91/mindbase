import { Router } from 'express';
import type { ServerContext } from '../context';
import { runSynthesis, topicKey } from '../lib/synthesis';

export function synthesizeRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const { topic, force } = req.body as { topic?: string; force?: boolean };
    if (typeof topic !== 'string' || topic.trim().length === 0) {
      res.status(400).json({ error: 'topic required' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    function emit(event: string, data: unknown): void {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    const key = topicKey(topic);

    try {
      if (!force) {
        const cached = await ctx.synthesisCache.readSynthesis(key);
        if (cached) {
          emit('meta', { topic, model: cached.model, cached: true, generated_at: cached.generated_at, source_hashes: cached.source_hashes });
          for (const thread of cached.threads) emit('thread', thread);
          for (const gap of cached.gaps) emit('gap', gap);
          for (const c of cached.contradictions) emit('contradiction', c);
          emit('done', { generated_at: cached.generated_at, cached: true });
          res.end();
          return;
        }
      }

      const result = await runSynthesis(ctx, topic);
      await ctx.synthesisCache.writeSynthesis(key, result);
      emit('meta', { topic, model: result.model, cached: false, generated_at: result.generated_at, source_hashes: result.source_hashes });

      for (const thread of result.threads) emit('thread', thread);
      for (const gap of result.gaps) emit('gap', gap);
      for (const c of result.contradictions) emit('contradiction', c);
      emit('done', { generated_at: result.generated_at, cached: false });
    } catch (e) {
      emit('error', { error: (e as Error).message });
    }
    res.end();
  });

  return router;
}
