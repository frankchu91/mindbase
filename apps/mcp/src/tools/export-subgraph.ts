// apps/mcp/src/tools/export-subgraph.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { bundlePages } from '../lib/markdown-bundle.js';

const inputSchema = z.object({
  slug: z.string().min(1),
  depth: z.number().int().min(1).max(3).optional().default(2),
});

export const definition = {
  name: 'export_subgraph',
  description: 'Export a page + its connected neighbors (up to N hops) as a self-contained markdown bundle.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      depth: { type: 'number' },
    },
    required: ['slug'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { slug, depth } = parsed.data;

  try {
    const graph = ctx.wikiIndex.buildGraph();
    if (!graph.nodes.has(slug)) return errorResult(`Page not found: '${slug}'`);

    // BFS to depth
    const visited = new Set<string>([slug]);
    const queue: Array<{ s: string; d: number }> = [{ s: slug, d: 0 }];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.d >= depth) continue;
      const neighbors = [...(graph.outgoing.get(cur.s) ?? []), ...(graph.incoming.get(cur.s) ?? [])];
      for (const n of neighbors) {
        if (!visited.has(n)) { visited.add(n); queue.push({ s: n, d: cur.d + 1 }); }
      }
    }

    const slugs = [...visited];
    const bundle = await bundlePages(ctx.store, graph, slugs);
    return textResult({ bundle_markdown: bundle, pages_included: slugs });
  } catch (e) {
    return errorResult(`export_subgraph failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
