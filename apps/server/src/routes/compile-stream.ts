import { Router } from 'express';
import { compileL1, compileL1Plan, compileL1Execute, slugify } from '@mindbase/core';
import type { RawDoc, MetaJson, CompileL1ProgressEvent, CompileL1Plan, ApprovalMap } from '@mindbase/core';
import type { ServerContext } from '../context';
import { isValidSlug } from '../safe-path';
import { makeHybridSearchClosure } from '../lib/compile-deps';
import { classifyNoteAsync } from '../lib/classify-worker';

// Separate from `compileRoutes` because Express's manual SSE pattern needs
// explicit `res.write` instead of `res.json`.
export function compileStreamRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.post('/note/:slug/stream', async (req, res) => {
    const slug = req.params['slug']!;
    if (!isValidSlug(slug)) {
      res.status(400).json({ ok: false, error: 'invalid slug' });
      return;
    }

    // Read note + meta
    const mdPath = `wiki/notes/${slug}.md`;
    const metaPath = `wiki/notes/${slug}.meta.json`;
    let body: string;
    let meta: MetaJson;
    try {
      body = await ctx.store.readText(mdPath);
      meta = await ctx.store.readJSON<MetaJson>(metaPath);
    } catch (err) {
      const isMissing = (err as NodeJS.ErrnoException).code === 'ENOENT';
      if (isMissing) {
        res.status(404).json({ ok: false, error: `note ${slug} not found` });
      } else {
        res.status(500).json({ ok: false, error: `failed to read note: ${(err as Error).message}` });
      }
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    let cancelled = false;
    req.on('close', () => { cancelled = true; });

    function emit(eventName: string, payload: unknown): void {
      if (cancelled) return;
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    const rawDoc: RawDoc = {
      id: `note:${slug}`,
      path: mdPath,
      title: meta.title,
      source_url: null,
      captured_at: meta.updated ?? new Date().toISOString(),
      content: body,
      images: [],
    };

    try {
      const adapter = ctx.getAdapter();
      const result = await compileL1({
        raw: rawDoc,
        adapter,
        store: ctx.store,
        model: ctx.config.model,
        wikiIndex: ctx.wikiIndex,
        hybridSearch: makeHybridSearchClosure(ctx),
        onProgress: (event: CompileL1ProgressEvent) => {
          switch (event.kind) {
            case 'started':
              emit('status', { text: event.text });
              break;
            case 'searching':
              emit('status', { text: event.text });
              break;
            case 'candidates_found':
              emit('candidates', { items: event.candidates });
              break;
            case 'reading':
              emit('tool_start', {
                name: event.action,
                slug: event.slug,
                iteration: event.iteration,
              });
              break;
            case 'applied':
              emit('tool_done', {
                name: event.action,
                slug: event.slug,
                ok: event.ok,
                ...(event.error ? { error: event.error } : {}),
              });
              break;
            case 'aborted':
              emit('status', { text: `Aborted: ${event.reason}` });
              break;
            case 'done':
              // Internal "LLM finished tool-use" — covered by 'complete' below
              break;
            case 'complete':
              emit('complete', {
                summary: event.summary,
                ...(event.navigateTo ? { navigateTo: event.navigateTo } : {}),
                tokensUsed: event.tokensUsed,
                durationMs: event.durationMs,
              });
              break;
            default: {
              const _exhaustive: never = event;
              void _exhaustive;
            }
          }
        },
      });

      if (result.ok && !cancelled) {
        await ctx.reindexWiki();
        // If compile produced or appended to a note, classify it.
        const navigate = result.tool_results.find((tr) =>
          (tr.call.name === 'create_concept' || tr.call.name === 'append_to_concept') && tr.result.ok);
        if (navigate) {
          const args = navigate.call.arguments as Record<string, unknown>;
          const targetName = (args['name'] ?? args['concept_name']) as string | undefined;
          if (targetName) {
            classifyNoteAsync(ctx, slugify(targetName));
          }
        }
      }
    } catch (e) {
      emit('error', { message: (e as Error).message });
    } finally {
      res.end();
    }
  });

  // ─── F1: plan/approve/execute split ──────────────────────────────────
  //
  // POST /api/compile-stream/:rawId/plan
  //   Runs compileL1Plan; streams SSE events:
  //     - { kind: 'started' }
  //     - { kind: 'proposed', action: ProposedAction }   (one per call)
  //     - { kind: 'done', planId: string, usage }
  //   The server caches the plan in-memory keyed by planId so the execute
  //   endpoint can resume without re-running the LLM.
  //
  // POST /api/compile-stream/execute/:planId
  //   Body: { approvals: ApprovalMap }
  //   Streams: { kind: 'exec', action, result } per action, then { kind: 'done' }.

  const planCache = new Map<string, { plan: CompileL1Plan; rawDoc: RawDoc; cachedAt: number }>();
  const PLAN_TTL_MS = 30 * 60 * 1000; // 30 min

  function gcPlanCache(): void {
    const now = Date.now();
    for (const [id, entry] of planCache) {
      if (now - entry.cachedAt > PLAN_TTL_MS) planCache.delete(id);
    }
  }

  router.post('/:rawId/plan', async (req, res) => {
    const rawId = req.params['rawId']!;
    if (!isValidSlug(rawId)) { res.status(400).end(); return; }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    function emit(eventName: string, payload: unknown): void {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    try {
      const rawDoc = await ctx.findRawDoc(rawId);
      if (!rawDoc) {
        emit('error', { error: `raw ${rawId} not found` });
        res.end();
        return;
      }

      emit('started', { rawId, title: rawDoc.title });

      const plan = await compileL1Plan({
        raw: rawDoc,
        adapter: ctx.getAdapter(),
        store: ctx.store,
        model: ctx.config.model,
        wikiIndex: ctx.wikiIndex,
        hybridSearch: makeHybridSearchClosure(ctx),
      });

      // Surface the LLM's narrative BEFORE the structured actions so the UI
      // can render takeaways → action review as a 4-phase flow.
      if (plan.takeaways) {
        emit('takeaways', { text: plan.takeaways });
      }

      for (const action of plan.proposed) {
        emit('proposed', { action });
      }

      gcPlanCache();
      const planId = `${rawId}-${Date.now().toString(36)}`;
      planCache.set(planId, { plan, rawDoc, cachedAt: Date.now() });

      emit('done', { planId, usage: plan.total_usage, error: plan.error });
    } catch (e) {
      emit('error', { error: (e as Error).message });
    }
    res.end();
  });

  router.post('/execute/:planId', async (req, res) => {
    const planId = req.params['planId']!;
    const cached = planCache.get(planId);
    if (!cached) {
      res.status(404).json({ error: 'plan expired or not found — re-run /plan' });
      return;
    }
    const { approvals = {} } = (req.body ?? {}) as { approvals?: ApprovalMap };

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    function emit(eventName: string, payload: unknown): void {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    try {
      for await (const { action, result } of compileL1Execute(
        {
          raw: cached.rawDoc,
          store: ctx.store,
          wikiIndex: ctx.wikiIndex,
        },
        cached.plan,
        approvals,
      )) {
        emit('exec', { action, result });
      }
      await ctx.reindexWiki();
      emit('done', {});
      planCache.delete(planId);
    } catch (e) {
      emit('error', { error: (e as Error).message });
    }
    res.end();
  });

  return router;
}
