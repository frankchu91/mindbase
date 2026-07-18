import { Router } from 'express';
import { compileL1 } from '@mindbase/core';
import type { ServerContext } from '../context';
import { makeHybridSearchClosure } from '../lib/compile-deps';
import { appendChangesLog } from '../lib/changes-log';

export function ingestStreamRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.post('/:rawId', async (req, res) => {
    const rawId = req.params['rawId']!;
    const rawDoc = await ctx.findRawDoc(rawId);
    if (!rawDoc) {
      res.status(404).json({ ok: false, error: `raw ${rawId} not found` });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    function emit(event: string, data: unknown): void {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    emit('started', { rawId, title: rawDoc.title });

    try {
      const result = await compileL1({
        raw: rawDoc,
        adapter: ctx.getAdapter(),
        store: ctx.store,
        model: ctx.config.model,
        wikiIndex: ctx.wikiIndex,
        hybridSearch: makeHybridSearchClosure(ctx),
        onProgress: (e) => emit(e.kind, e),
      });

      if (result.ok) {
        await ctx.reindexWiki();
        // Append per-mutation lines to _changes.md (append-only audit trail).
        await appendChangesLog(ctx, result.tool_results, rawDoc.id);
      }

      // Mark synthesis caches that reference touched slugs as stale.
      const touched = new Set<string>();
      for (const tr of result.tool_results) {
        if (!tr.result.ok) continue;
        const args = tr.call.arguments as Record<string, unknown>;
        const slug = (args.concept_name ?? args.note_name ?? args.name) as string | undefined;
        if (slug) touched.add(slug);
      }
      for (const slug of touched) {
        await ctx.synthesisCache.markStaleFor(slug).catch(() => {});
      }

      emit('summary', {
        ok: result.ok,
        error: result.error,
        aborted_reason: result.aborted_reason,
        action_count: result.tool_results.length,
        tokens: result.total_usage,
      });
    } catch (e) {
      emit('error', { error: (e as Error).message });
    }

    res.end();
  });

  return router;
}
