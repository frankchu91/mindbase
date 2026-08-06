import path from 'node:path';
import { unlinkSync } from 'node:fs';
import dotenv from 'dotenv';
// Load .env from the project root, regardless of CWD (e.g., when launched via pnpm -F)
dotenv.config({ path: path.resolve(import.meta.dirname, '../../../.env') });

import express from 'express';
import { createContext } from './context';
import { resolveDataDirAsync } from './config';
import { ingestRoutes } from './routes/ingest';
import { compileRoutes } from './routes/compile';
import { compileStreamRoutes } from './routes/compile-stream';
import { askRoutes } from './routes/ask';
import { fileToWikiRoutes } from './routes/file_to_wiki';
import { configRoutes } from './routes/config';
import { ollamaRoutes } from './routes/ollama';
import { opsRoutes } from './routes/ops';
import { lintRoutes } from './routes/lint';
import { searchRoutes } from './routes/search';
import { chatRoutes } from './routes/chats';
import { crosslinkRoutes } from './routes/crosslink';
import { googleRoutes } from './routes/google';
import { graphRoutes } from './routes/graph';
import { agentHistoryRoutes } from './routes/agent-history';
import { semanticSearchRoutes } from './routes/semantic-search';
import { obsidianRoutes } from './routes/obsidian';
import { captureRoutes } from './routes/capture';
import { devicesRoutes } from './routes/devices';
import { inboxRoutes } from './routes/inbox';
import { briefRoutes } from './routes/brief';
import { feedsRoutes } from './routes/feeds';
import { srsRoutes } from './routes/srs';
import { synthesizeRoutes } from './routes/synthesize';
import { ingestStreamRoutes } from './routes/ingest-stream';
import { networkRoutes } from './routes/network';
import { pulseRoutes } from './routes/pulse';
import { schemaRoutes } from './routes/schema';
import { insightsRoutes } from './routes/insights';
import { auditLogRoutes } from './routes/audit-log';
import { trashRoutes } from './routes/trash';
import { foldersRoutes } from './routes/folders';
import { classifyRoutes } from './routes/classify';
import { treeRoutes } from './routes/tree/index.js';
import { projectsRoutes } from './routes/projects';
import { serverRoutes } from './routes/server';
import { answerFileBackRoutes } from './routes/answer-file-back';
import { projectSchemaRoutes } from './routes/project-schema';
import { projectSuggestionsRoutes } from './routes/project-suggestions';
import { AnalysisScheduler } from './lib/analysis-scheduler';
import { auditProjectLayouts } from './lib/layout-guard.js';
import { analysisRoutes } from './routes/analysis';
import { CaptureWorker } from './lib/capture-worker';
import { BriefScheduler } from './lib/brief-scheduler';
import { RSSWorker } from './lib/rss-worker';
import { SRSExtractor } from './lib/srs-worker';
import { EmbeddingIndexer } from './lib/embedding-indexer';
import { SynthesisWorker } from './lib/synthesis-worker';
import { startMdns } from './lib/mdns';

const PORT = parseInt(process.env['PORT'] ?? '4321', 10);

/**
 * Install a process-level safety net for the MiniSearch radix-tree crash
 * (and any other operational tree-corruption bug). When MiniSearch's
 * background `performVacuuming` runs into a node it can't iterate (usually
 * caused by empty-string tokens that slipped past the tokenizer guards),
 * the entire Node process would otherwise terminate with an uncaught
 * TypeError. We catch that specific signature, delete the on-disk index
 * (it's reproducible from the wiki files), and log a recovery hint —
 * the next request will rebuild a clean index lazily via reindexWiki().
 */
function installSearchIndexCrashGuard(dataDir: string): void {
  function isMinisearchTreeCrash(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const stack = err.stack ?? '';
    return (
      err.message.includes("Cannot read properties of undefined") &&
      (stack.includes('minisearch') || stack.includes('SearchableMap'))
    );
  }
  function recover(err: unknown): void {
    if (!isMinisearchTreeCrash(err)) {
      // Not the bug we expect — re-throw to preserve normal crash behavior
      throw err;
    }
    const indexPath = path.join(dataDir, 'meta', 'search-index.json');
    console.error(
      `[search-index-guard] caught MiniSearch tree corruption — deleting ${indexPath} for fresh rebuild`,
    );
    try { unlinkSync(indexPath); } catch { /* may not exist */ }
    console.warn('[search-index-guard] server continues; next reindexWiki() will rebuild');
  }
  process.on('uncaughtException', recover);
  process.on('unhandledRejection', recover);
}

async function main() {
  const dataDir = await resolveDataDirAsync();

  const layoutAudit = await auditProjectLayouts(dataDir);
  if (layoutAudit.v1Skipped.length > 0) {
    console.warn(`⚠️  Skipping v1 layout projects: ${layoutAudit.v1Skipped.join(', ')}`);
    console.warn(`   Delete manually or run '/mb:migrate' via plugin.`);
  }
  console.log(`[layout] v2 projects: ${layoutAudit.v2.length}`);

  installSearchIndexCrashGuard(dataDir);

  const ctx = await createContext(dataDir);

  // CaptureWorker is constructed here (not inside createContext) to avoid a
  // circular dependency: CaptureWorker's constructor accepts ServerContext.
  const captureWorker = new CaptureWorker(ctx, ctx.inbox);
  ctx.captureWorker = captureWorker;

  // BriefScheduler — same pattern as CaptureWorker
  const briefScheduler = new BriefScheduler(ctx);
  ctx.briefScheduler = briefScheduler;

  // RSSWorker — unconditional start; no-ops when feeds list is empty
  const rssWorker = new RSSWorker(ctx, ctx.feeds, ctx.inbox);
  ctx.rssWorker = rssWorker;

  // SRSExtractor — unconditional start; no-ops when SRS is disabled in config
  const srsExtractor = new SRSExtractor(ctx, ctx.cards);
  ctx.srsExtractor = srsExtractor;

  // EmbeddingIndexer — background dense index worker (non-blocking)
  const embeddingIndexer = new EmbeddingIndexer(ctx, ctx.embeddingStore);
  ctx.embeddingIndexer = embeddingIndexer;

  // SynthesisWorker — polls .stale set every 5s and rebuilds stale synthesis caches
  const synthesisWorker = new SynthesisWorker(ctx);
  ctx.synthesisWorker = synthesisWorker;

  const app = express();

  app.use(express.json({ limit: '80mb' }));

  // API routes
  app.use('/api/ingest', ingestRoutes(ctx));
  app.use('/api/compile', compileRoutes(ctx));
  app.use('/api/compile', compileStreamRoutes(ctx));
  app.use('/api/ask', askRoutes(ctx));
  app.use('/api/wiki/file', fileToWikiRoutes(ctx));
  app.use('/api/wiki/insights', insightsRoutes(ctx));
  app.use('/api/config', configRoutes(ctx));
  app.use('/api', ollamaRoutes());
  app.use('/api/ops', opsRoutes(ctx));
  app.use('/api/lint', lintRoutes(ctx));
  app.use('/api/search', searchRoutes(ctx));
  app.use('/api/chats', chatRoutes(ctx));
  app.use('/api/crosslink', crosslinkRoutes(ctx));
  app.use('/api/google', googleRoutes(ctx));
  app.use('/api/graph', graphRoutes(ctx));
  app.use('/api/obsidian', obsidianRoutes(ctx));
  app.use('/api/agent-history', agentHistoryRoutes(ctx));
  app.use('/api/semantic-search', semanticSearchRoutes(ctx));
  app.use('/api/capture', captureRoutes(ctx, ctx.devices, ctx.inbox));
  app.use('/api/devices', devicesRoutes(ctx.devices));
  app.use('/api/inbox', inboxRoutes(ctx.inbox, captureWorker));
  app.use('/api/brief', briefRoutes(ctx, briefScheduler));
  app.use('/api/feeds', feedsRoutes(ctx, ctx.feeds, rssWorker));
  app.use('/api/srs', srsRoutes(ctx, ctx.cards, srsExtractor));
  app.use('/api/synthesize', synthesizeRoutes(ctx));
  app.use('/api/wiki/ingest-stream', ingestStreamRoutes(ctx));
  app.use('/api/network', networkRoutes(ctx));
  app.use('/api/pulse', pulseRoutes(ctx));
  app.use('/api/schema', schemaRoutes(ctx));
  const analysisScheduler = new AnalysisScheduler(ctx);
  app.use('/api/analysis', analysisRoutes(ctx, analysisScheduler));
  app.use('/api/audit-log', auditLogRoutes(ctx));
  app.use('/api/trash', trashRoutes(ctx));
  app.use('/api/folders', foldersRoutes(ctx));
  app.use('/api/classify', classifyRoutes(ctx));
  // v2 v2-layout tree API.
  app.use('/api/tree', treeRoutes(ctx));
  app.use('/api/projects', projectsRoutes(ctx));
  app.use('/api/server', serverRoutes(ctx));
  app.use('/api/answer/file-back', answerFileBackRoutes(ctx));
  app.use('/api/project/schema', projectSchemaRoutes(ctx));
  app.use('/api/project/suggestions', projectSuggestionsRoutes(ctx));
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, dataDir: ctx.dataDir });
  });

  // Start background capture worker after all routes are wired.
  captureWorker.start();

  // Start brief scheduler (will no-op if not configured).
  briefScheduler.start();

  // Start RSS worker unconditionally; no-ops when feeds list is empty.
  rssWorker.start();

  // Start SRS extractor unconditionally; no-ops when disabled in config.
  srsExtractor.start();

  // Start embedding indexer in background (does NOT block boot).
  embeddingIndexer.start();

  // Refresh the BM25 search index in the background so v2 pages
  // (sources/research/ + context.md) are retrievable on first ask —
  // otherwise the index only updates after the first wiki mutation.
  void ctx.reindexWiki().catch((e) => console.warn('[boot] reindexWiki failed:', (e as Error).message));

  // Start synthesis worker — polls .stale set every 5s.
  synthesisWorker.start();

  // Phase 4 analysis scheduler
  analysisScheduler.start();

  // Serve built web UI
  const webDist = path.resolve(import.meta.dirname, '../../web/dist');
  app.use(express.static(webDist));
  app.get('*', (_req, res, next) => {
    if (_req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });

  // Graceful shutdown: flush SQLite WAL before exiting.
  function shutdown(): void {
    try { analysisScheduler.stop(); } catch { /* ignore */ }
    try { ctx.wikiIndex.close(); } catch { /* ignore */ }
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  app.listen(PORT, () => {
    console.log(`MindBase server running at http://localhost:${PORT}`);
    console.log(`Data directory: ${ctx.dataDir}`);

    if (process.env['MINDBASE_MDNS'] !== 'off') {
      try {
        startMdns(PORT);
        console.log(`[mdns] advertising on _mindbase._tcp local`);
      } catch (e) {
        // mDNS failures shouldn't crash the server (e.g. macOS firewall blocked, no network, etc.)
        console.warn(`[mdns] failed to start:`, e);
      }
    }
  });
}

main().catch((e) => {
  console.error('Failed to start MindBase server:', e);
  process.exit(1);
});
