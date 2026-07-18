import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import type { PageGraph } from '../graph/types';
import type { WikiIndex } from '../graph/index/wiki-index';

export interface CommunitySummary {
  id: number;
  size: number;
  label: string;        // best-guess label from the top page's title
}

export interface CommunityResult {
  assignments: Map<string, number>;     // slug → community_id
  summaries: CommunitySummary[];
}

/**
 * Detect communities via Louvain on the wiki's link graph.
 * Treats edges as undirected for partitioning (concept relatedness is symmetric
 * even when wikilinks are directional). Edges with broken targets are skipped.
 */
export function detectCommunities(graph: PageGraph): CommunityResult {
  if (graph.nodes.size === 0) return { assignments: new Map(), summaries: [] };

  const g = new Graph({ type: 'undirected', multi: false });
  for (const [slug] of graph.nodes) g.addNode(slug);
  for (const edge of graph.edges) {
    if (edge.broken) continue;
    if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue;
    if (edge.source === edge.target) continue;
    if (g.hasEdge(edge.source, edge.target)) continue;
    g.addEdge(edge.source, edge.target);
  }

  // Isolated nodes — Louvain still assigns them; each becomes its own community.
  const raw = louvain(g) as Record<string, number>;
  const assignments = new Map<string, number>();
  for (const [slug, id] of Object.entries(raw)) assignments.set(slug, id);

  // Build summaries — one per distinct id, label = title of the highest-inbound page
  const byCommunity = new Map<number, string[]>();
  for (const [slug, id] of assignments) {
    const arr = byCommunity.get(id) ?? [];
    arr.push(slug);
    byCommunity.set(id, arr);
  }
  const summaries: CommunitySummary[] = [];
  for (const [id, slugs] of byCommunity) {
    let topSlug = slugs[0]!;
    let topInbound = -1;
    for (const slug of slugs) {
      const inbound = graph.incoming.get(slug)?.length ?? 0;
      if (inbound > topInbound) {
        topInbound = inbound;
        topSlug = slug;
      }
    }
    const node = graph.nodes.get(topSlug);
    summaries.push({ id, size: slugs.length, label: node?.title ?? topSlug });
  }

  return { assignments, summaries };
}

/**
 * Persist community detection results into the index:
 * - update pages.community_id for every assigned slug
 * - clear and rewrite the `communities` table summary rows
 *
 * Both happen in one transaction.
 */
export function persistCommunities(index: WikiIndex, result: CommunityResult): void {
  index.applyCommunityAssignments(result);
}
