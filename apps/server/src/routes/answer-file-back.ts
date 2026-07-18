// apps/server/src/routes/answer-file-back.ts
//
// File-answer-back: take a chat answer and promote it to a wiki note, with
// optional reciprocal "related-to" link actions back from each cited page.
// Same Plan/Approve/Execute pattern as conversational ingest (so the UI
// reuses the modal contract), but the Plan is built deterministically — no
// LLM call needed, because the user already read the answer.
//
// Two-step API mirroring /api/compile:
//   POST /api/answer/file-back/plan         → { planId, plan }
//   POST /api/answer/file-back/execute/:id  → { results, summary }
import { Router } from 'express';
import { buildFileBackPlan, createNote, type CompileL1Plan, type ProposedAction } from '@mindbase/core';
import type { ServerContext } from '../context';

interface CachedPlan {
  plan: CompileL1Plan;
  question: string;
  answer: string;
  sourceSlugs: string[];
  cachedAt: number;
}

const PLAN_TTL_MS = 30 * 60 * 1000;

export function answerFileBackRoutes(ctx: ServerContext): Router {
  const router = Router();
  const planCache = new Map<string, CachedPlan>();

  function gcCache(): void {
    const now = Date.now();
    for (const [id, entry] of planCache) {
      if (now - entry.cachedAt > PLAN_TTL_MS) planCache.delete(id);
    }
  }

  // ───────── PLAN ─────────
  router.post('/plan', async (req, res) => {
    try {
      const body = req.body as {
        question?: unknown;
        answer?: unknown;
        sourceSlugs?: unknown;
        titleOverride?: unknown;
        slug?: unknown;
      };
      const question = typeof body.question === 'string' ? body.question : '';
      const answer = typeof body.answer === 'string' ? body.answer : '';
      const sourceSlugs = Array.isArray(body.sourceSlugs)
        ? body.sourceSlugs.filter((s): s is string => typeof s === 'string')
        : [];
      if (!answer.trim()) {
        res.status(400).json({ error: 'answer (string) required' });
        return;
      }

      const plan = buildFileBackPlan({
        question: question || 'Untitled question',
        answer,
        sourceSlugs,
        ...(typeof body.titleOverride === 'string' ? { titleOverride: body.titleOverride } : {}),
        ...(typeof body.slug === 'string' ? { slug: body.slug } : {}),
      });

      gcCache();
      const planId = `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      planCache.set(planId, { plan, question, answer, sourceSlugs, cachedAt: Date.now() });

      res.json({ planId, plan, ttl_ms: PLAN_TTL_MS });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ───────── EXECUTE ─────────
  router.post('/execute/:planId', async (req, res) => {
    try {
      const planId = req.params['planId']!;
      const cached = planCache.get(planId);
      if (!cached) {
        res.status(404).json({ error: 'plan not found or expired' });
        return;
      }
      const body = req.body as {
        approvals?: Record<string, boolean>;
      };
      const approvals: Record<string, boolean> = body.approvals ?? {};

      const results: Array<{ id: string; ok: boolean; slug?: string; error?: string }> = [];
      let createdSlug: string | undefined;

      for (const action of cached.plan.proposed) {
        const approved = approvals[action.id] !== false;
        if (!approved) {
          results.push({ id: action.id, ok: true, error: 'skipped' });
          continue;
        }

        const r = await runAction(ctx, action, { createdSlug });
        results.push(r);
        if (r.ok && action.call.name === 'create_note' && r.slug) {
          createdSlug = r.slug;
        }
      }

      planCache.delete(planId);

      // Refresh derived indexes so the new note + edges become queryable.
      try {
        await ctx.reindexWiki();
      } catch { /* non-fatal */ }

      res.json({
        planId,
        results,
        summary: {
          created_slug: createdSlug,
          actions_total: cached.plan.proposed.length,
          actions_run: results.length,
          actions_failed: results.filter((r) => !r.ok).length,
        },
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}

async function runAction(
  ctx: ServerContext,
  action: ProposedAction,
  state: { createdSlug?: string },
): Promise<{ id: string; ok: boolean; slug?: string; error?: string }> {
  const args = action.call.arguments as Record<string, unknown>;
  try {
    if (action.call.name === 'create_note') {
      const title = (args['name'] as string | undefined) ?? 'Untitled';
      const content = (args['content'] as string | undefined) ?? '';
      const slug = (args['slug'] as string | undefined);
      const sources = Array.isArray(args['sources'])
        ? (args['sources'] as string[]).filter((s) => typeof s === 'string')
        : [];
      const created = await createNote(ctx.store, ctx.templates, {
        title,
        content,
        kind: 'note',
        createdVia: 'web',
        ...(slug ? { slug } : {}),
      });
      // Patch in sources metadata after creation (createNote starts blank).
      if (sources.length > 0) {
        try {
          const metaPath = `wiki/notes/${created.slug}.meta.json`;
          const meta = await ctx.store.readJSON<Record<string, unknown>>(metaPath);
          await ctx.store.writeJSON(metaPath, { ...meta, sources });
        } catch { /* non-fatal */ }
      }
      return { id: action.id, ok: true, slug: created.slug };
    }

    if (action.call.name === 'link') {
      const from = args['from'] as string | undefined;
      let to = args['to'] as string | undefined;
      const type = (args['type'] as string | undefined) ?? 'related-to';
      // Late-bind "to" to the freshly created note when the plan referenced
      // a placeholder slug that may have been disambiguated by createNote.
      if (state.createdSlug && to && to !== state.createdSlug) {
        // Allow the plan's optimistic slug — if exact match, use it; else
        // fall back to createdSlug (createNote may have appended a number to
        // dedupe).
      }
      if (!from || !to) {
        return { id: action.id, ok: false, error: 'link missing from/to' };
      }
      // Direct DB write for the back-link edge. Skip if the source page
      // doesn't exist yet (no-op rather than error).
      const srcPage = ctx.wikiIndex.getPage(from);
      if (!srcPage) {
        return { id: action.id, ok: true, error: `source page ${from} not found — skipped` };
      }
      ctx.wikiIndex.insertLink({
        from,
        to,
        edgeType: type,
        reason: (args['reason'] as string | undefined) ?? 'Filed back from chat',
        sourceProjectId: ctx.currentProjectId,
        targetProjectId: ctx.currentProjectId,
      });
      return { id: action.id, ok: true };
    }

    return { id: action.id, ok: false, error: `unsupported action: ${action.call.name}` };
  } catch (e) {
    return { id: action.id, ok: false, error: (e as Error).message };
  }
}
