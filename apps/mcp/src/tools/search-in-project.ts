// apps/mcp/src/tools/search-in-project.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import type { MetaJson } from '@mindbase/core';

const inputSchema = z.object({
  query: z.string().min(1),
  project: z.string().min(1),
  limit: z.number().int().positive().max(50).optional().default(10),
});

export const definition = {
  name: 'search_in_project',
  description: 'Search the wiki, restricted to pages tagged with a specific project (uses the `project` frontmatter field).',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      project: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['query', 'project'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { query, project, limit } = parsed.data;

  try {
    const hits = ctx.searchIndex.search(query);
    const results: Array<{ slug: string; title: string; one_liner: string; score: number }> = [];
    for (const hit of hits) {
      const slug = hit.path.replace(/^wiki\/notes\//, '').replace(/\.md$/, '');
      try {
        const m = await ctx.store.readJSON<MetaJson>(`wiki/notes/${slug}.meta.json`);
        if (m.project !== project) continue;
        results.push({ slug, title: m.title, one_liner: m.one_liner ?? '', score: hit.score });
        if (results.length >= limit) break;
      } catch { /* skip */ }
    }
    return textResult(results);
  } catch (e) {
    return errorResult(`search_in_project failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
