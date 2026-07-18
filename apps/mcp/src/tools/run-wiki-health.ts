// apps/mcp/src/tools/run-wiki-health.ts
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { generateInsights, renderInsightsMarkdown, crossLink, compileL2 } from '@mindbase/core';

export const definition = {
  name: 'run_wiki_health',
  description: 'Run the full Wiki Health pipeline: build graph → generate insights → auto cross-link → L2 lint. Writes _insights.md and applies improvements.',
  inputSchema: { type: 'object', properties: {} },
};

export async function handle(ctx: Context) {
  if (!ctx.config) return errorResult('LLM not configured', 'Open MindBase Settings to configure your LLM.');
  try {
    const graph = ctx.wikiIndex.buildGraph();
    const insights = await generateInsights(graph, ctx.store);
    const md = renderInsightsMarkdown(insights, graph);
    await ctx.store.writeText('wiki/_insights.md', md);

    const xlink = await crossLink(ctx.store, { mode: 'auto' });
    const adapter = ctx.getAdapter();
    const lint = await compileL2({ adapter, store: ctx.store, model: ctx.config.model });
    await ctx.reindex();

    return textResult({
      insights: {
        page_count: insights.pageCount,
        edge_count: insights.edgeCount,
        hubs: insights.hubs.slice(0, 5),
        orphans: insights.orphans.length,
        broken_links: insights.brokenLinks.length,
      },
      crosslink_applied: xlink.applied,
      lint_actions: lint.tool_results.length,
      insights_path: 'wiki/_insights.md',
    });
  } catch (e) {
    return errorResult(`run_wiki_health failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, () => handle(ctx));
  defs.push(definition);
}
