// apps/mcp/src/tools/find-related.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import type { MetaJson } from '@mindbase/core';

const inputSchema = z.object({
  slug: z.string().min(1),
  depth: z.number().int().min(1).max(3).optional().default(2),
});

export const definition = {
  name: 'find_related',
  description: 'Find pages connected to a given page via wikilinks, shared tags, or shared sources. Returns a ranked list with the connection reason.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      depth: { type: 'number', description: 'Hop depth (1-3; default 2)' },
    },
    required: ['slug'],
  },
};

interface Related {
  slug: string;
  title: string;
  one_liner: string;
  reason: 'wikilink' | 'shared_tag' | 'shared_source';
  hops: number;
}

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { slug, depth } = parsed.data;

  try {
    const graph = ctx.wikiIndex.buildGraph();
    if (!graph.nodes.has(slug)) return errorResult(`Page not found: '${slug}'`, 'Use search_wiki to find the right slug.');

    let sourceMeta: Partial<MetaJson> = {};
    try {
      sourceMeta = await ctx.store.readJSON<MetaJson>(`wiki/notes/${slug}.meta.json`);
    } catch { /* ok */ }

    const sourceTags = new Set((sourceMeta as { tags?: string[] }).tags ?? []);
    const sourceSources = new Set(sourceMeta.sources ?? []);

    const seen = new Map<string, Related>();

    // BFS via wikilinks up to `depth`
    const queue: Array<{ slug: string; hops: number }> = [{ slug, hops: 0 }];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.hops >= depth) continue;
      const neighbors = [
        ...(graph.outgoing.get(cur.slug) ?? []),
        ...(graph.incoming.get(cur.slug) ?? []),
      ];
      for (const n of neighbors) {
        if (n === slug || seen.has(n)) continue;
        const node = graph.nodes.get(n);
        if (!node) continue;
        seen.set(n, { slug: n, title: node.title, one_liner: node.summary ?? '', reason: 'wikilink', hops: cur.hops + 1 });
        queue.push({ slug: n, hops: cur.hops + 1 });
      }
    }

    // Add tag/source matches
    for (const [otherSlug, node] of graph.nodes) {
      if (otherSlug === slug || seen.has(otherSlug)) continue;
      try {
        const m = await ctx.store.readJSON<MetaJson>(`wiki/notes/${otherSlug}.meta.json`);
        const otherTags = new Set((m as { tags?: string[] }).tags ?? []);
        const tagOverlap = [...sourceTags].some((t) => otherTags.has(t));
        if (tagOverlap) {
          seen.set(otherSlug, { slug: otherSlug, title: node.title, one_liner: node.summary ?? '', reason: 'shared_tag', hops: 1 });
          continue;
        }
        const sourceOverlap = (m.sources ?? []).some((s) => sourceSources.has(s));
        if (sourceOverlap) {
          seen.set(otherSlug, { slug: otherSlug, title: node.title, one_liner: node.summary ?? '', reason: 'shared_source', hops: 1 });
        }
      } catch { /* skip */ }
    }

    return textResult([...seen.values()].sort((a, b) => a.hops - b.hops || a.title.localeCompare(b.title)));
  } catch (e) {
    return errorResult(`find_related failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
