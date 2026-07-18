import { Router } from 'express';
import { lintWiki, parseLog } from '@mindbase/core';
import type { ServerContext } from '../context';

export function projectSuggestionsRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const report = await lintWiki(ctx.store, ctx.wikiIndex);
      const logBody = await ctx.store.readText('wiki/log.md').catch(() => '');
      const recent = parseLog(logBody).slice(0, 3);

      const suggestions: string[] = [];

      // From lint: missing concepts (most mentioned first)
      const missing = report.findings
        .filter((f) => f.kind === 'missing-concept')
        .slice(0, 2);
      for (const m of missing) {
        const mentioned = (m.details?.['mentionedBy'] as string[] | undefined)?.length ?? 1;
        suggestions.push(
          `Write up the concept page for "${m.slug}" — it's mentioned by ${mentioned} page${mentioned === 1 ? '' : 's'} but missing.`,
        );
      }

      // From recent activity: re-read latest ingest
      if (recent[0]) {
        suggestions.push(
          `Re-read your latest ingest "${recent[0].title}" — what's the strongest claim?`,
        );
      }

      // Always-on fallback
      if (suggestions.length < 3) {
        suggestions.push(
          'Drop a new source — your wiki grows fastest with fresh inputs.',
        );
      }

      res.json({ suggestions: suggestions.slice(0, 3) });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
