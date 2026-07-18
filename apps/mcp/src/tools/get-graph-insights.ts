// apps/mcp/src/tools/get-graph-insights.ts
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { generateInsights } from '@mindbase/core';

export const definition = {
  name: 'get_graph_insights',
  description: 'Compute graph insights for the wiki: top hubs, orphans, broken links, fragmented tag clusters.',
  inputSchema: { type: 'object', properties: {} },
};

export async function handle(ctx: Context) {
  try {
    const graph = ctx.wikiIndex.buildGraph();
    const insights = await generateInsights(graph, ctx.store);
    return textResult({
      total_pages: insights.pageCount,
      total_links: insights.edgeCount,
      hubs: insights.hubs.map((h) => ({ slug: h.slug, title: h.title, incoming: h.incoming, outgoing: h.outgoing })),
      orphans: insights.orphans.map((slug) => ({ slug, title: graph.nodes.get(slug)?.title ?? slug })),
      broken_links: insights.brokenLinks,
      fragmented_tags: insights.cohesion.fragmented.map((c) => ({ tag: c.tag, cohesion: c.score })),
    });
  } catch (e) {
    return errorResult(`get_graph_insights failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, () => handle(ctx));
  defs.push(definition);
}
