// apps/mcp/src/tools/read-wiki-page.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import type { MetaJson } from '@mindbase/core';

const inputSchema = z.object({ slug: z.string().min(1) });

export const definition = {
  name: 'read_wiki_page',
  description: 'Read the full content (markdown body + frontmatter + incoming/outgoing wikilinks) of a wiki page by its slug.',
  inputSchema: {
    type: 'object',
    properties: { slug: { type: 'string', description: 'Page slug (e.g. "rag-architecture")' } },
    required: ['slug'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { slug } = parsed.data;

  try {
    const body = await ctx.store.readText(`wiki/notes/${slug}.md`);
    let frontmatter: Partial<MetaJson> = {};
    try {
      frontmatter = await ctx.store.readJSON<MetaJson>(`wiki/notes/${slug}.meta.json`);
    } catch { /* meta missing */ }

    const graph = ctx.wikiIndex.buildGraph();
    const incoming = graph.incoming.get(slug) ?? [];
    const outgoing = graph.outgoing.get(slug) ?? [];

    return textResult({ slug, title: frontmatter.title ?? slug, body, frontmatter, incoming, outgoing });
  } catch {
    // Look for similar slugs to suggest
    const suggestions: string[] = [];
    try {
      const entries = await ctx.store.listDir('wiki/notes');
      for (const e of entries) {
        if (e.kind !== 'file' || !e.name.endsWith('.md')) continue;
        const s = e.name.replace(/\.md$/, '');
        if (s.includes(slug.toLowerCase()) || slug.toLowerCase().includes(s)) suggestions.push(s);
      }
    } catch { /* ok */ }
    return errorResult(
      `Page not found: '${slug}'`,
      suggestions.length > 0 ? `Did you mean: ${suggestions.slice(0, 3).join(', ')}?` : 'Use search_wiki to find the right slug.',
      suggestions.length > 0 ? { suggestions: suggestions.slice(0, 5) } : undefined,
    );
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
