import { generateInsights, renderInsightsMarkdown } from '@mindbase/core';
import type { ServerContext } from '../context';

export interface InsightsReport {
  page_count: number;
  edge_count: number;
  hubs: Array<{ slug: string; in_count: number; out_count: number; role: string }>;
  orphans: string[];
  broken_links: Array<{ from: string; to: string }>;
  generated_at: string;
}

const META_PATH = 'wiki/_insights.meta.json';

export async function generateAndWriteInsights(ctx: ServerContext): Promise<InsightsReport> {
  const graph = ctx.wikiIndex.buildGraph();
  const insights = await generateInsights(graph, ctx.store);
  const md = renderInsightsMarkdown(insights, graph);
  await ctx.store.writeText('wiki/_insights.md', md);
  const report: InsightsReport = {
    page_count: insights.pageCount,
    edge_count: insights.edgeCount,
    hubs: insights.hubs.map((h) => ({
      slug: h.slug,
      in_count: h.incoming,
      out_count: h.outgoing,
      role: h.role,
    })),
    orphans: insights.orphans,
    broken_links: insights.brokenLinks.map((b) => ({ from: b.source, to: b.target })),
    generated_at: new Date().toISOString(),
  };
  await ctx.store.writeJSON(META_PATH, report);
  return report;
}

export async function readCachedInsights(ctx: ServerContext): Promise<InsightsReport | null> {
  try {
    return await ctx.store.readJSON<InsightsReport>(META_PATH);
  } catch {
    return null;
  }
}

export function isFresh(report: InsightsReport, maxAgeMs: number = 24 * 3600 * 1000): boolean {
  const age = Date.now() - new Date(report.generated_at).getTime();
  return age < maxAgeMs;
}
