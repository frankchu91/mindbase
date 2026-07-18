import type { PageGraph } from '../graph/types';

const HUB_PERCENTILE = 0.99;

/**
 * Compute the p99 inbound_count threshold across a list of counts.
 * Returns Infinity for empty input. Shared helper used by both Phase 3
 * (gatherCompileContext hub skip) and Phase 4 (god-node detection).
 */
export function p99InboundThreshold(counts: number[]): number {
  if (counts.length === 0) return Infinity;
  const sorted = [...counts].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * HUB_PERCENTILE);
  return sorted[Math.min(idx, sorted.length - 1)] ?? Infinity;
}

export interface GodNode {
  slug: string;
  title: string;
  inboundCount: number;
  outboundCount: number;
}

export interface GodNodeResult {
  threshold: number;  // p99 inbound count used
  nodes: GodNode[];   // sorted by inboundCount descending
}

/**
 * Detect god-nodes: pages whose inbound_count meets or exceeds the p99
 * threshold of all pages in the graph. As the wiki grows, the threshold
 * adapts. Sorted by inboundCount descending (largest hubs first).
 */
export function detectGodNodes(graph: PageGraph): GodNodeResult {
  const counts: number[] = [];
  for (const slug of graph.nodes.keys()) {
    counts.push(graph.incoming.get(slug)?.length ?? 0);
  }
  const threshold = p99InboundThreshold(counts);

  const nodes: GodNode[] = [];
  for (const [slug, node] of graph.nodes) {
    const inboundCount = graph.incoming.get(slug)?.length ?? 0;
    if (inboundCount >= threshold) {
      nodes.push({
        slug,
        title: node.title,
        inboundCount,
        outboundCount: graph.outgoing.get(slug)?.length ?? 0,
      });
    }
  }
  nodes.sort((a, b) => b.inboundCount - a.inboundCount);
  return { threshold, nodes };
}
