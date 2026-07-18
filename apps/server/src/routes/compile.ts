import { Router } from 'express';
import { compileL1, projectPaths } from '@mindbase/core';
import type { RawDoc } from '@mindbase/core';
import type { ServerContext } from '../context';
import { detectLayoutVersion, projectRoot } from '../context';
import { makeHybridSearchClosure } from '../lib/compile-deps';
import { loadManifest, saveManifest, contentHash } from '../manifest';
import { appendChangesLog } from '../lib/changes-log';

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

export function compileRoutes(ctx: ServerContext): Router {
  const router = Router();

  // POST /api/compile/build — UI-side trigger that parallels /mb:build.
  // v0.1: the server has no LLM-synthesis loop; this is a stub that
  // accepts the request and instructs the user to run /mb:build in
  // Claude Code to complete synthesis. Wired in so the UI button has
  // somewhere to call while the plugin is the real engine.
  // MUST be registered BEFORE the `/:rawId` catch-all below.
  router.post('/build', async (req, res) => {
    const projectId = (req.body as { projectId?: string } | undefined)?.projectId;
    if (!projectId) {
      res.status(400).json({ error: 'projectId required' });
      return;
    }
    res.status(202).json({
      accepted: true,
      projectId,
      message: 'Build triggered. Run /mb:build in Claude Code to complete synthesis. The UI does not host an LLM call directly.',
    });
  });

  router.post('/:rawId', async (req, res) => {
    try {
      const rawDoc = await ctx.findRawDoc(req.params['rawId']!);
      if (!rawDoc) {
        res.status(404).json({ ok: false, error: `raw ${req.params['rawId']} not found` });
        return;
      }
      const adapter = ctx.getAdapter();
      const result = await compileL1({
        raw: rawDoc,
        adapter,
        store: ctx.store,
        model: ctx.config.model,
        wikiIndex: ctx.wikiIndex,
        hybridSearch: makeHybridSearchClosure(ctx),
      });
      if (result.ok) {
        await ctx.reindexWiki();

        // Append to log.md
        const actions = result.tool_results.map((tr) => tr.call.name).join(', ');
        const pagesCreated = result.tool_results
          .filter((tr) => tr.call.name === 'create_concept' && tr.result.ok)
          .map((tr) => (tr.call.arguments as { name?: string }).name ?? '?');
        const pagesUpdated = result.tool_results
          .filter((tr) =>
            tr.result.ok &&
            (tr.call.name === 'append_to_concept' ||
             tr.call.name === 'update_note' ||
             tr.call.name === 'rewrite_concept' ||
             tr.call.name === 'update_one_liner'))
          .map((tr) => {
            const a = tr.call.arguments as { concept_name?: string; note_name?: string };
            return (a.concept_name ?? a.note_name ?? '?') as string;
          });
        const pagesRead = result.tool_results
          .filter((tr) => tr.call.name === 'read_concept' && tr.result.ok)
          .map((tr) => (tr.call.arguments as { slug?: string }).slug ?? '?');
        const logEntry = [
          `## [${new Date().toISOString()}] ingest | ${rawDoc.title}`,
          `- Source: ${rawDoc.source_url ?? 'manual input'}`,
          `- Raw ID: ${rawDoc.id}`,
          `- Actions: ${actions}`,
          `- Pages read: ${pagesRead.length > 0 ? pagesRead.join(', ') : 'none'}`,
          `- Pages created: ${pagesCreated.length > 0 ? pagesCreated.join(', ') : 'none'}`,
          `- Pages updated: ${pagesUpdated.length > 0 ? pagesUpdated.join(', ') : 'none'}`,
          `- Total actions: ${result.tool_results.length}`,
          `- Tokens: input ${result.total_usage.input_tokens}, output ${result.total_usage.output_tokens}`,
          '',
        ].join('\n');

        const logPath = await resolveWikiPath(ctx.dataDir, ctx.currentProjectId, 'wiki/log.md');
        let logBody = '';
        try {
          logBody = await ctx.store.readText(logPath);
        } catch {
          logBody = '# MindBase Wiki Log\n\n';
        }
        logBody = `${logBody.trimEnd()}\n\n${logEntry}`;
        await ctx.store.writeText(logPath, logBody);

        // Append per-mutation lines to _changes.md (append-only audit trail).
        await appendChangesLog(ctx, result.tool_results, rawDoc.id);

        // Update manifest
        const manifest = await loadManifest(ctx.store);
        manifest.sources[`raw/${rawDoc.id}`] = {
          ingested_at: new Date().toISOString(),
          content_hash: contentHash(rawDoc.content),
          source_url: rawDoc.source_url,
          title: rawDoc.title,
          pages_created: pagesCreated,
          pages_updated: pagesUpdated,
          tokens_used: { input: result.total_usage.input_tokens, output: result.total_usage.output_tokens },
        };
        manifest.stats.total_tokens.input += result.total_usage.input_tokens;
        manifest.stats.total_tokens.output += result.total_usage.output_tokens;
        await saveManifest(ctx.store, manifest);

        // Update hot.md (session cache)
        const hotEntry = `Ingested "${rawDoc.title}" — ${pagesCreated.length} pages created, ${result.tool_results.length} total actions.`;
        let hotBody = '';
        try {
          hotBody = await ctx.store.readText('wiki/hot.md');
        } catch {
          hotBody = '---\nupdated: ' + new Date().toISOString() + '\n---\n\n## Recent Activity\n\n## Active Threads\n\n## Key Takeaways\n';
        }
        // Update Recent Activity section (keep last 3)
        const recentMatch = hotBody.match(/(## Recent Activity\n)([\s\S]*?)(?=\n## )/);
        if (recentMatch) {
          const existingLines = recentMatch[2]!.trim().split('\n').filter((l) => l.trim());
          const recent = [...existingLines, `- ${hotEntry}`].slice(-3).join('\n');
          hotBody = hotBody.replace(/(## Recent Activity\n)[\s\S]*?(?=\n## )/, `$1\n${recent}\n`);
        }
        hotBody = hotBody.replace(/updated: .*/, `updated: ${new Date().toISOString()}`);
        await ctx.store.writeText('wiki/hot.md', hotBody);
      }
      res.json({ ok: result.ok, error: result.error });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  return router;
}
