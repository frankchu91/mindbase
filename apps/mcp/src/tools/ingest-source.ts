// apps/mcp/src/tools/ingest-source.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { ingestPaste, compileL1, crossLink, slugify, hybridSearch, EmbeddingStore, type HybridResult } from '@mindbase/core';

const inputSchema = z.object({
  text: z.string().min(1),
  title: z.string().optional(),
  source_url: z.string().url().optional(),
});

export const definition = {
  name: 'ingest_source',
  description: 'Ingest a new source into the wiki: saves the raw text, runs LLM compile to create/update wiki pages, applies cross-linking. Returns a summary of changes.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      title: { type: 'string', description: 'Optional title; LLM will infer if omitted' },
      source_url: { type: 'string', description: 'Optional source URL for attribution' },
    },
    required: ['text'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { text, title, source_url } = parsed.data;
  if (!ctx.config) return errorResult('LLM not configured', 'Open MindBase Settings to configure your LLM.');

  try {
    const raw = await ingestPaste(ctx.store, { text, title, source_url });
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
    const compileResult = await compileL1({ raw, adapter, store: ctx.store, model: ctx.config.model, wikiIndex: ctx.wikiIndex, hybridSearch: hybridSearchFn });
    if (!compileResult.ok) return errorResult(`Compile failed: ${compileResult.error}`);

    const xlink = await crossLink(ctx.store, { mode: 'auto' });
    await ctx.reindex();

    const created: string[] = [];
    const updated: string[] = [];
    for (const tr of compileResult.tool_results) {
      if (tr.call.name === 'create_concept') created.push((tr.call.arguments as { name?: string }).name ?? '');
      if (tr.call.name === 'append_to_concept' || tr.call.name === 'update_note') {
        updated.push((tr.call.arguments as { concept_name?: string; note_name?: string }).concept_name ?? (tr.call.arguments as { note_name?: string }).note_name ?? '');
      }
    }

    return textResult({
      raw_id: raw.id,
      pages_created: created.filter(Boolean).map((n) => slugify(n)),
      pages_updated: [...new Set(updated.filter(Boolean))],
      cross_links_added: xlink.applied,
      tokens_used: compileResult.total_usage,
    });
  } catch (e) {
    return errorResult(`ingest_source failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
