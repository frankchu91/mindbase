import { Router } from 'express';
import {
  generateInsights, renderInsightsMarkdown, crossLink, compileL2,
  lintWiki, projectPaths,
} from '@mindbase/core';
import type { ServerContext } from '../context';
import { detectLayoutVersion, projectRoot } from '../context';

/**
 * Translate a legacy v1 path (e.g., "wiki/notes/<slug>.md") to v2 if the
 * project has been migrated; otherwise return v1 path unchanged.
 *
 * v1: wiki/notes/<slug>.md, wiki/sources/<slug>.md, wiki/INDEX.md, wiki/log.md
 * v2: sources/contributors/<user>/<slug>.md, sources/research/<slug>.md, context.md, logs/
 */
async function resolveWikiPath(dataDir: string, projectId: string, legacyPath: string, user: string = 'default'): Promise<string> {
  const root = projectRoot(dataDir, projectId);
  const layout = await detectLayoutVersion(root);
  if (layout === 'v1') return legacyPath;
  const p = projectPaths();
  if (legacyPath.startsWith('wiki/notes/')) {
    const slug = legacyPath.replace(/^wiki\/notes\//, '').replace(/\.md$/, '');
    return p.contributorDay(user, slug);
  }
  if (legacyPath.startsWith('wiki/sources/')) {
    const slug = legacyPath.replace(/^wiki\/sources\//, '').replace(/\.md$/, '');
    return p.researchFile(slug);
  }
  if (legacyPath === 'wiki/INDEX.md') return p.context;
  if (legacyPath === 'wiki/schema.md') return p.readme;
  if (legacyPath === 'wiki/log.md') return p.logsRoot;
  return legacyPath;
}

export function lintRoutes(ctx: ServerContext): Router {
  const router = Router();

  // GET /api/lint — fast deterministic check (no LLM, no network).
  // Returns orphan pages, missing concepts (linked-to but no page), and
  // stale pages. Per Karpathy's lint spec; surfaced as cards on the
  // Project Dashboard. The killer feature Notion / NotebookLM can't do.
  router.get('/', async (req, res) => {
    try {
      const allProjects = req.query['scope'] === 'all';
      const report = await lintWiki(ctx.store, ctx.wikiIndex, {
        currentProjectId: ctx.currentProjectId,
        allProjects,
      });
      res.json(report);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/', async (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      // Stage 1: build graph
      res.write(`data: ${JSON.stringify({ kind: 'progress', phase: 'build_graph' })}\n\n`);
      const graph = ctx.wikiIndex.buildGraph();

      // Stage 2: insights
      res.write(`data: ${JSON.stringify({ kind: 'progress', phase: 'insights' })}\n\n`);
      const insights = await generateInsights(graph, ctx.store);
      const md = renderInsightsMarkdown(insights, graph);
      const insightsPath = await resolveWikiPath(ctx.dataDir, ctx.currentProjectId, 'wiki/_insights.md');
      await ctx.store.writeText(insightsPath, md);

      // Stage 3: cross-link auto
      res.write(`data: ${JSON.stringify({ kind: 'progress', phase: 'crosslink' })}\n\n`);
      const xlink = await crossLink(ctx.store, { mode: 'auto' });

      // Stage 4: L2 lint with graph context
      res.write(`data: ${JSON.stringify({ kind: 'progress', phase: 'l2_lint' })}\n\n`);
      const adapter = ctx.getAdapter();
      const lint = await compileL2({ adapter, store: ctx.store, model: ctx.config.model });

      if (lint.ok) {
        await ctx.reindexWiki();
      }

      res.write(`data: ${JSON.stringify({
        kind: 'done',
        ok: lint.ok,
        error: lint.error,
        insights: {
          pageCount: insights.pageCount,
          edgeCount: insights.edgeCount,
          hubs: insights.hubs.slice(0, 5),
          orphans: insights.orphans.length,
          brokenLinks: insights.brokenLinks.length,
        },
        crosslink: { applied: xlink.applied, pagesModified: xlink.pagesModified.length },
        lintActions: lint.tool_results.length,
        usage: lint.total_usage,
      })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ kind: 'error', error: (e as Error).message })}\n\n`);
    }

    res.end();
  });

  return router;
}
