import type { PageGraph } from '../graph/types';

export interface BridgeNode {
  slug: string;
  title: string;
  communityCount: number;
  communities: number[];      // distinct community ids among neighbors
  neighborCount: number;
}

/**
 * Detect bridge-nodes: pages whose neighbors (incoming + outgoing) span 2+
 * different communities. Broken edges are ignored.
 *
 * Returned sorted by communityCount desc, then neighborCount desc.
 */
export function detectBridgeNodes(graph: PageGraph, assignments: Map<string, number>): BridgeNode[] {
  if (assignments.size === 0) return [];

  // Build a set of non-broken neighbor pairs (undirected for the purpose of
  // community-spanning).
  const neighbors = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.broken) continue;
    if (!graph.nodes.has(edge.source) || !graph.nodes.has(edge.target)) continue;
    const src = neighbors.get(edge.source) ?? new Set<string>();
    src.add(edge.target);
    neighbors.set(edge.source, src);
    const dst = neighbors.get(edge.target) ?? new Set<string>();
    dst.add(edge.source);
    neighbors.set(edge.target, dst);
  }

  const bridges: BridgeNode[] = [];
  for (const [slug, neighborSlugs] of neighbors) {
    const node = graph.nodes.get(slug);
    if (!node) continue;
    const communities = new Set<number>();
    for (const n of neighborSlugs) {
      const c = assignments.get(n);
      if (c !== undefined) communities.add(c);
    }
    if (communities.size >= 2) {
      bridges.push({
        slug,
        title: node.title,
        communityCount: communities.size,
        communities: [...communities].sort((a, b) => a - b),
        neighborCount: neighborSlugs.size,
      });
    }
  }

  bridges.sort((a, b) => {
    if (b.communityCount !== a.communityCount) return b.communityCount - a.communityCount;
    return b.neighborCount - a.neighborCount;
  });
  return bridges;
}
