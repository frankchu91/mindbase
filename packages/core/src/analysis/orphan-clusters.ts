import type { PageGraph } from '../graph/types';

export interface OrphanCluster {
  slugs: string[];      // all nodes in the cluster
  size: number;
}

/**
 * Detect orphan clusters: connected components that are NOT the largest
 * component (the "main wiki"). Single-node islands count. Broken edges
 * are ignored. Returns clusters sorted by size desc.
 */
export function detectOrphanClusters(graph: PageGraph): OrphanCluster[] {
  if (graph.nodes.size === 0) return [];

  // Build undirected adjacency from non-broken edges.
  const adj = new Map<string, Set<string>>();
  for (const slug of graph.nodes.keys()) adj.set(slug, new Set());
  for (const edge of graph.edges) {
    if (edge.broken) continue;
    if (!adj.has(edge.source) || !adj.has(edge.target)) continue;
    adj.get(edge.source)!.add(edge.target);
    adj.get(edge.target)!.add(edge.source);
  }

  // BFS to find all connected components.
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const slug of graph.nodes.keys()) {
    if (visited.has(slug)) continue;
    const queue: string[] = [slug];
    const comp: string[] = [];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      comp.push(cur);
      for (const n of adj.get(cur) ?? new Set()) {
        if (!visited.has(n)) queue.push(n);
      }
    }
    components.push(comp);
  }

  if (components.length <= 1) return [];

  // Largest = main wiki.
  components.sort((a, b) => b.length - a.length);
  const [, ...rest] = components;
  return rest.map((comp) => ({ slugs: comp.sort(), size: comp.length }))
    .sort((a, b) => b.size - a.size);
}
