import { Router } from 'express';
import type { ServerContext } from '../context';
import { hybridSearch, parseOperators, type SearchFilters } from '@mindbase/core';
import { embed } from '../lib/embedder.js';

function makePageStats(ctx: ServerContext) {
  return (slug: string) => {
    const p = ctx.wikiIndex.getPage(slug);
    if (!p) return null;
    return { inboundCount: p.inbound_count, updatedAt: p.updated_at, title: p.title };
  };
}

/**
 * Search routes.
 *
 * GET  /api/search?q=...           Legacy BM25-only search (backward compat for MCP tool)
 * POST /api/search/hybrid          Multilingual BM25 + BGE-M3 vector search via RRF
 * GET  /api/search/index-status    Embedding indexer progress
 * POST /api/search/ask             Ask AI grounded on specific context slugs (SSE stream)
 */
export function searchRoutes(ctx: ServerContext): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // GET /api/search?q=...  — legacy BM25 endpoint (keep for backward compat)
  // ---------------------------------------------------------------------------
  router.get('/', (req, res) => {
    const q = (req.query['q'] as string | undefined) ?? '';
    if (!q.trim()) {
      res.json({ results: [] });
      return;
    }
    const results = ctx.searchIndex.search(q);
    res.json({ results });
  });

  // ---------------------------------------------------------------------------
  // GET /api/search/index-status — embedding indexer progress
  // ---------------------------------------------------------------------------
  router.get('/index-status', (_req, res) => {
    res.json(ctx.embeddingIndexer?.getStatus() ?? { indexed: 0, total: 0 });
  });

  // ---------------------------------------------------------------------------
  // POST /api/search/hybrid — multilingual BM25 + dense RRF search
  // ---------------------------------------------------------------------------
  router.post('/hybrid', async (req, res) => {
    const {
      q,
      limit,
      filters,
      federate,
    } = req.body as {
      q?: string;
      limit?: number;
      filters?: SearchFilters;
      federate?: boolean;
    };

    if (!q?.trim()) {
      res.json({ results: [], query_used: { q: '', filters: {} }, index_status: ctx.embeddingIndexer?.getStatus() ?? { indexed: 0, total: 0 } });
      return;
    }

    // Parse operators from query string (defense-in-depth: client may also parse)
    const parsed = parseOperators(q);
    const effectiveFilters: SearchFilters = {
      ...filters,
      ...parsed.filters,
      tags: [...(filters?.tags ?? []), ...(parsed.filters.tags ?? [])],
    };

    try {
      const results = await hybridSearch({
        query: { q: parsed.q || q, limit, filters: effectiveFilters },
        searchIndex: ctx.searchIndex,
        embeddingStore: ctx.embeddingStore,
        embedFn: embed,
        store: ctx.store,
        k: limit ?? 8,
        pageStats: makePageStats(ctx),
      });

      // Federated search: inbox + chats (lightweight BM25 only)
      let inboxResults: Array<{ id: string; title: string; snippet: string; source: 'inbox' }> = [];
      let chatResults: Array<{ id: string; title: string; snippet: string; source: 'chat' }> = [];

      if (federate && parsed.q) {
        const cleanQ = (parsed.q || q).toLowerCase();

        // Search inbox entries
        try {
          const inboxEntries = await ctx.inbox.list();
          for (const entry of inboxEntries) {
            const haystack = `${entry.title ?? ''} ${entry.text ?? ''}`.toLowerCase();
            if (haystack.includes(cleanQ)) {
              const idx = haystack.indexOf(cleanQ);
              const raw = `${entry.title ?? ''} ${entry.text ?? ''}`;
              const snippet = raw.slice(Math.max(0, idx - 40), idx + 120);
              inboxResults.push({ id: entry.id, title: entry.title ?? 'Untitled', snippet, source: 'inbox' });
              if (inboxResults.length >= 3) break;
            }
          }
        } catch { /* inbox may be empty */ }

        // Search saved chats
        try {
          const chatEntries = await ctx.store.listDir('chats');
          for (const entry of chatEntries) {
            if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
            try {
              const body = await ctx.store.readText(`chats/${entry.name}`);
              const bodyLower = body.toLowerCase();
              if (bodyLower.includes(cleanQ)) {
                const idx = bodyLower.indexOf(cleanQ);
                const snippet = body.slice(Math.max(0, idx - 40), idx + 120);
                const id = entry.name.replace(/\.md$/, '');
                const titleLine = body.split('\n').find((l) => l.startsWith('# '));
                const title = titleLine ? titleLine.replace(/^# /, '') : id;
                chatResults.push({ id, title, snippet, source: 'chat' });
                if (chatResults.length >= 3) break;
              }
            } catch { /* skip */ }
          }
        } catch { /* chats dir may be empty */ }
      }

      res.json({
        results,
        query_used: { q: parsed.q || q, filters: effectiveFilters },
        index_status: ctx.embeddingIndexer?.getStatus() ?? { indexed: 0, total: 0 },
        federated: federate
          ? { inbox: inboxResults, chats: chatResults }
          : undefined,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/search/ask — ask AI grounded on specific context slugs (SSE)
  // ---------------------------------------------------------------------------
  router.post('/ask', async (req, res) => {
    const { q, context_slugs, history } = req.body as {
      q: string;
      context_slugs: string[];
      history?: Array<{ role: 'user' | 'assistant'; text: string }>;
    };

    if (!q?.trim()) {
      res.status(400).json({ error: 'q is required' });
      return;
    }

    const slugs = Array.isArray(context_slugs) ? context_slugs.slice(0, 5) : [];

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const { askQuestion } = await import('@mindbase/core');
      const adapter = ctx.getAdapter();

      for await (const event of askQuestion({
        question: q,
        store: ctx.store,
        index: ctx.searchIndex,
        adapter,
        model: ctx.config.model,
        history,
        maxSourceChars: ctx.config.maxContextChars,
        // Pass forced context slugs so retrieval is skipped
        forcedContextSlugs: slugs,
      })) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ kind: 'error', error: (e as Error).message })}\n\n`);
    } finally {
      res.end();
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/search/expand-or-suggest — zero-result recovery
  // ---------------------------------------------------------------------------
  router.post('/expand-or-suggest', async (req, res) => {
    const { q } = req.body as { q?: string };
    if (!q?.trim() || q.length <= 2) {
      res.json({ expansions: [], suggestions: [] });
      return;
    }

    try {
      const { expandQuery, didYouMean } = await import('../lib/query-expand.js');
      const [expansions, suggestions] = await Promise.all([
        expandQuery(q, ctx).catch(() => [] as string[]),
        didYouMean(q, ctx.embeddingStore, embed).catch(() => [] as Array<{ slug: string; title: string }>),
      ]);
      res.json({ expansions, suggestions });
    } catch (e) {
      res.json({ expansions: [], suggestions: [] });
    }
  });

  return router;
}
