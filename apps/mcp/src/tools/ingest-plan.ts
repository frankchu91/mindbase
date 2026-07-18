// apps/mcp/src/tools/ingest-plan.ts
//
// First half of conversational ingest. Reads a source, returns the LLM's
// pre-action narrative ("takeaways") plus a structured plan of proposed
// tool_use calls — but doesn't write anything to disk. Pair with
// `ingest_execute` to commit the user-approved subset.
//
// Stateful: the plan is cached on the server keyed by the returned planId
// so `ingest_execute` can resume without re-running the LLM.
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import {
  compileL1Plan,
  ingestPaste,
  hybridSearch,
  EmbeddingStore,
  type HybridResult,
  type CompileL1Plan,
  type RawDoc,
} from '@mindbase/core';
import { planCache, PLAN_TTL_MS } from '../lib/plan-cache.js';

const inputSchema = z.object({
  text: z.string().min(1).optional(),
  raw_id: z.string().optional(),
  title: z.string().optional(),
  source_url: z.string().url().optional(),
}).refine((d) => d.text || d.raw_id, {
  message: 'either text or raw_id is required',
});

export const definition = {
  name: 'ingest_plan',
  description:
    "Conversational ingest, step 1 of 2. Reads the source, returns the LLM's narrative takeaways " +
    'and a structured plan of proposed actions — without writing anything yet. ' +
    'The user reviews the takeaways + plan, decides which actions to approve, and then ' +
    'calls ingest_execute(planId, approvals) to commit the approved subset.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Raw source text to ingest (PDF text, URL extract, paste).' },
      raw_id: { type: 'string', description: 'Re-plan against an already-ingested raw doc instead of saving new text.' },
      title: { type: 'string', description: 'Optional title; LLM will infer if omitted.' },
      source_url: { type: 'string', description: 'Optional source URL for attribution.' },
    },
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { text, raw_id, title, source_url } = parsed.data;
  if (!ctx.config) return errorResult('LLM not configured', 'Open MindBase Settings to configure your LLM.');

  try {
    let raw: RawDoc;
    if (raw_id) {
      const ingestArgs = source_url ? { text: '', title, source_url } : { text: '', title };
      // Re-fetch the existing raw doc rather than re-saving the body.
      raw = await loadRaw(ctx, raw_id);
      void ingestArgs;
    } else {
      raw = await ingestPaste(ctx.store, { text: text!, title, source_url });
    }

    const adapter = ctx.getAdapter();
    const embeddingStore = new EmbeddingStore(ctx.dataDir);
    const hybridSearchFn = async (query: string, limit: number): Promise<HybridResult[]> => {
      return hybridSearch({
        query: { q: query, limit },
        searchIndex: ctx.searchIndex,
        embeddingStore,
        embedFn: async () => [],
        store: ctx.store,
        k: limit,
        pageStats: (slug: string) => {
          const p = ctx.wikiIndex.getPage(slug);
          return p
            ? { inboundCount: p.inbound_count, updatedAt: p.updated_at, title: p.title }
            : null;
        },
      });
    };

    const plan: CompileL1Plan = await compileL1Plan({
      raw,
      adapter,
      store: ctx.store,
      model: ctx.config.model,
      wikiIndex: ctx.wikiIndex,
      hybridSearch: hybridSearchFn,
    });

    gcPlanCache();
    const planId = `${raw.id}-${Date.now().toString(36)}`;
    planCache.set(planId, { plan, rawDoc: raw, cachedAt: Date.now() });

    return textResult({
      planId,
      raw_id: raw.id,
      takeaways: plan.takeaways,
      proposed: plan.proposed.map((p) => ({
        id: p.id,
        type: 'tool_use',  // Anthropic-style block shape
        name: p.call.name,
        input: p.call.arguments,
        simulated: p.simulatedResult.ok ? { ok: true } : { ok: false, error: p.simulatedResult.error },
      })),
      total_usage: plan.total_usage,
      error: plan.error,
      ttl_ms: PLAN_TTL_MS,
    });
  } catch (e) {
    return errorResult(`ingest_plan failed: ${(e as Error).message}`);
  }
}

function gcPlanCache(): void {
  const now = Date.now();
  for (const [id, entry] of planCache) {
    if (now - entry.cachedAt > PLAN_TTL_MS) planCache.delete(id);
  }
}

async function loadRaw(ctx: Context, rawId: string): Promise<RawDoc> {
  // Minimal raw-doc reload: read the markdown + meta sidecar. Plan only needs
  // content for retrieval; attachments can stay on disk.
  const dateDirs = await ctx.store.listDir('raw').catch(() => []);
  for (const dir of dateDirs) {
    if (dir.kind !== 'directory') continue;
    const path = `raw/${dir.name}/${rawId}.md`;
    try {
      const content = await ctx.store.readText(path);
      let title = rawId;
      let sourceUrl: string | null = null;
      let capturedAt = new Date(0).toISOString();
      try {
        const meta = await ctx.store.readJSON<{
          title?: string; source_url?: string | null; captured_at?: string;
        }>(`raw/${dir.name}/${rawId}.meta.json`);
        title = meta.title ?? rawId;
        sourceUrl = meta.source_url ?? null;
        capturedAt = meta.captured_at ?? capturedAt;
      } catch { /* meta optional */ }
      return {
        id: rawId,
        path,
        title,
        source_url: sourceUrl,
        captured_at: capturedAt,
        content,
        images: [],
      };
    } catch { /* try next date dir */ }
  }
  throw new Error(`raw doc ${rawId} not found under raw/`);
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
