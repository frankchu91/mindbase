// apps/server/src/routes/ops.ts
//
// SSE endpoints for server-side operations (UI parity with the plugin).
import { Router } from 'express';
import type { Response } from 'express';
import type { ServerContext } from '../context';
import { projectRoot as makeProjectRoot, detectLayoutVersion } from '../context';
import {
  runContributePlan, applyContributePlan, runBuild, runLint,
  latestLintArtifact, dismissLintFinding,
  type OpEvent, type OpsCtx,
} from '../ops/runner';
import { makeHybridSearchClosure } from '../lib/compile-deps';

function sse(res: Response): (e: OpEvent) => void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders?.();
  return (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
}

function unconfigured(ctx: ServerContext): boolean {
  return !ctx.config.model || (!ctx.config.apiKey && !ctx.config.baseUrl && ctx.config.provider !== 'ollama');
}

async function opsCtx(ctx: ServerContext): Promise<OpsCtx | { error: string }> {
  if (unconfigured(ctx)) {
    return { error: 'Configure an LLM in Settings first (or pick the free local model).' };
  }
  const projectId = ctx.currentProjectId;
  const root = makeProjectRoot(ctx.dataDir, projectId);
  const layout = await detectLayoutVersion(root);
  if (layout === 'v1') return { error: 'V1_LAYOUT_UNSUPPORTED' };
  const hybrid = makeHybridSearchClosure(ctx);
  return {
    projectId,
    projectRoot: root,
    getAdapter: ctx.getAdapter,
    config: { model: ctx.config.model },
    findRelated: async (text, k) => {
      const hits = await hybrid(text.slice(0, 300), k);
      return hits.map((h) => ({ path: h.path, excerpt: `${h.title}: ${h.one_liner || ''}`.slice(0, 200) }));
    },
  };
}

export function opsRoutes(ctx: ServerContext): Router {
  const router = Router();

  // POST /api/ops/contribute
  //   { mode: 'plan', text }                      → phases + plan event
  //   { mode: 'apply', planId, selected: number[] } → applied + done
  router.post('/contribute', async (req, res) => {
    const emit = sse(res);
    const mode = req.body?.mode as string | undefined;
    if (mode === 'apply') {
      const planId = req.body?.planId as string | undefined;
      const selected = req.body?.selected as number[] | undefined;
      if (!planId || !Array.isArray(selected)) emit({ kind: 'error', error: 'planId and selected[] required' });
      else await applyContributePlan(planId, selected, emit);
      return res.end();
    }
    const text = (req.body?.text as string | undefined)?.trim();
    if (!text) {
      emit({ kind: 'error', error: 'text required' });
      return res.end();
    }
    const oc = await opsCtx(ctx);
    if ('error' in oc) {
      emit({ kind: 'error', error: oc.error });
      return res.end();
    }
    await runContributePlan(oc, text, emit);
    return res.end();
  });

  // POST /api/ops/build {}
  router.post('/build', async (_req, res) => {
    const emit = sse(res);
    const oc = await opsCtx(ctx);
    if ('error' in oc) {
      emit({ kind: 'error', error: oc.error });
      return res.end();
    }
    await runBuild(oc, emit);
    return res.end();
  });

  // POST /api/ops/lint {} — SSE; emits findings + caches them
  router.post('/lint', async (_req, res) => {
    const emit = sse(res);
    const oc = await opsCtx(ctx);
    if ('error' in oc) {
      emit({ kind: 'error', error: oc.error });
      return res.end();
    }
    await runLint(oc, emit);
    return res.end();
  });

  // GET /api/ops/lint/latest — cached findings for the Health view
  router.get('/lint/latest', async (_req, res) => {
    const root = makeProjectRoot(ctx.dataDir, ctx.currentProjectId);
    const artifact = await latestLintArtifact(root);
    return res.json(artifact ?? { date: null, findings: [] });
  });

  // POST /api/ops/lint/dismiss { id }
  router.post('/lint/dismiss', async (req, res) => {
    const id = req.body?.id as string | undefined;
    if (!id) return res.status(400).json({ error: 'id required' });
    const root = makeProjectRoot(ctx.dataDir, ctx.currentProjectId);
    const ok = await dismissLintFinding(root, id);
    return ok ? res.json({ ok: true }) : res.status(404).json({ error: 'finding not found' });
  });

  return router;
}
