import type { Store } from '../storage/store';
import type { WikiIndex } from '../graph/index/wiki-index';
import { detectCommunities, persistCommunities, type CommunitySummary } from './communities';
import { detectGodNodes, type GodNode } from './god-nodes';
import { detectBridgeNodes, type BridgeNode } from './bridge-nodes';
import { detectOrphanClusters, type OrphanCluster } from './orphan-clusters';
import { generateSuggestions, type Suggestion, type ContradictionSummary, type AmbiguousLink } from './suggestions';

export interface AnalysisInsights {
  communities: CommunitySummary[];
  godNodes: GodNode[];
  bridgeNodes: BridgeNode[];
  orphanClusters: OrphanCluster[];
  suggestions: Suggestion[];
  contradictions: ContradictionSummary[];
  computedAt: string;
}

export interface RunAnalysisOptions {
  store: Store;
  wikiIndex: WikiIndex;
}

/**
 * Top-level Phase 4 entrypoint: runs all detectors, writes to caches,
 * returns the unified insights payload.
 *
 * Does NOT trigger the contradiction probe — that runs on its own
 * schedule. Reads existing contradiction_cache entries.
 */
export async function runAnalysis(opts: RunAnalysisOptions): Promise<AnalysisInsights> {
  const { wikiIndex } = opts;
  const graph = wikiIndex.buildGraph();
  const now = new Date().toISOString();

  // 1. Communities
  const communityResult = detectCommunities(graph);
  if (communityResult.summaries.length > 0) {
    persistCommunities(wikiIndex, communityResult);
  }

  // 2. God-nodes
  const godNodeResult = detectGodNodes(graph);

  // 3. Bridge-nodes (community-aware)
  const bridgeNodes = detectBridgeNodes(graph, communityResult.assignments);

  // 4. Orphan-clusters
  const orphanClusters = detectOrphanClusters(graph);

  // 5. Existing contradictions (from cache — probe runs separately)
  const contradictions: ContradictionSummary[] = wikiIndex.contradictionCache().listConfirmed().map((c) => ({
    slugA: c.slugA, slugB: c.slugB, reason: c.reason ?? '',
  }));

  // 6. Ambiguous links — collect inferred/ambiguous edges for the suggestion layer
  const ambiguousLinks: AmbiguousLink[] = graph.edges
    .filter((e) => e.confidence === 'inferred' || e.confidence === 'ambiguous')
    .map((e) => ({ source: e.source, target: e.target, edgeType: e.edgeType, confidence: e.confidence }));

  // 7. Suggestions (composed)
  const suggestions = generateSuggestions({
    godNodes: godNodeResult.nodes,
    bridgeNodes,
    orphanClusters,
    contradictions,
    ambiguousLinks,
  });

  // 8. Cache results
  const cache = wikiIndex.analysisCache();
  cache.put('god_nodes', godNodeResult);
  cache.put('bridge_nodes', bridgeNodes);
  cache.put('orphan_clusters', orphanClusters);
  cache.put('suggestions', suggestions);

  return {
    communities: communityResult.summaries,
    godNodes: godNodeResult.nodes,
    bridgeNodes,
    orphanClusters,
    suggestions,
    contradictions,
    computedAt: now,
  };
}
