// apps/mcp/src/tools/search-wiki.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import type { MetaJson } from '@mindbase/core';

export const inputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(50).optional().default(10),
});

export const definition = {
  name: 'search_wiki',
  description: 'Full-text search across the user\'s MindBase wiki — matches page titles, one-liners, and slugs. Returns ranked list with snippets.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (1+ chars)' },
      limit: { type: 'number', description: 'Max results to return (default 10, max 50)' },
    },
    required: ['query'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  }
  const { query, limit } = parsed.data;

  try {
    const hits = ctx.searchIndex.search(query).slice(0, limit);
    const results = await Promise.all(hits.map(async (hit) => {
      const slug = hit.path
        .replace(/^projects\/[^/]+\/(sources\/(?:contributors\/[^/]+|research)|context\.md)\/?/, '')
        .replace(/^wiki\/notes\//, '')
        .replace(/\.md$/, '');
      let meta: Partial<MetaJson> = {};
      try {
        meta = await ctx.store.readJSON<MetaJson>(hit.path.replace(/\.md$/, '.meta.json'));
      } catch { /* ok */ }
      let body = '';
      try {
        body = await ctx.store.readText(hit.path);
      } catch { /* ok */ }
      // Build snippet: 200 chars around first match
      const lower = body.toLowerCase();
      const match = lower.indexOf(query.toLowerCase());
      const snippet = match >= 0
        ? '…' + body.slice(Math.max(0, match - 80), Math.min(body.length, match + 120)) + '…'
        : body.slice(0, 200);
      return {
        slug,
        title: meta.title ?? slug,
        one_liner: meta.one_liner ?? '',
        type: meta.type ?? 'concept',
        tags: (meta as { tags?: string[] }).tags ?? [],
        updated: meta.updated ?? '',
        score: hit.score,
        snippet,
      };
    }));
    return textResult(results);
  } catch (e) {
    return errorResult(`Search failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
