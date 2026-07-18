import type { GodNode } from './god-nodes';
import type { BridgeNode } from './bridge-nodes';
import type { OrphanCluster } from './orphan-clusters';

export interface AmbiguousLink {
  source: string;
  target: string;
  edgeType: string;
  confidence: string;
}

export interface ContradictionSummary {
  slugA: string;
  slugB: string;
  reason: string;
}

export interface SuggestionInput {
  godNodes: GodNode[];
  bridgeNodes: BridgeNode[];
  orphanClusters: OrphanCluster[];
  contradictions: ContradictionSummary[];
  ambiguousLinks: AmbiguousLink[];
}

export type SuggestionKind =
  | 'orphan_cluster'
  | 'contradiction'
  | 'god_node_disambiguation'
  | 'bridge_elaboration'
  | 'ambiguous_edge';

export interface Suggestion {
  kind: SuggestionKind;
  message: string;
  actionable: {
    slugs: string[];
  };
  severity: 'low' | 'medium' | 'high';
}

const DEFAULT_MAX = 5;
const GOD_NODE_AMBIGUOUS_THRESHOLD = 4;   // # of ambiguous edges targeting it
const BRIDGE_ELABORATION_MIN_COMMUNITIES = 3;

/**
 * Compose user-actionable suggestions from analysis layer outputs.
 * Ordered by severity desc, then by kind priority (contradictions first,
 * then orphans, then disambiguations). Capped to `max` (default 5).
 */
export function generateSuggestions(
  input: SuggestionInput,
  opts: { max?: number } = {},
): Suggestion[] {
  const out: Suggestion[] = [];

  // Confirmed contradictions — highest severity
  for (const c of input.contradictions) {
    out.push({
      kind: 'contradiction',
      message: `[[${c.slugA}]] and [[${c.slugB}]] contain contradictory claims — review which is correct.`,
      actionable: { slugs: [c.slugA, c.slugB] },
      severity: 'high',
    });
  }

  // Orphan clusters — medium severity, most important first
  for (const o of input.orphanClusters) {
    out.push({
      kind: 'orphan_cluster',
      message:
        o.size === 1
          ? `[[${o.slugs[0]}]] has no inbound links — consider linking it from a related page.`
          : `${o.size} pages (starting with [[${o.slugs[0]}]]) form an island disconnected from the main wiki.`,
      actionable: { slugs: o.slugs },
      severity: 'medium',
    });
  }

  // God-node disambiguation: god-nodes with many INFERRED edges pointing at them
  const ambiguousByTarget = new Map<string, number>();
  for (const a of input.ambiguousLinks) {
    if (a.confidence === 'inferred' || a.confidence === 'ambiguous') {
      ambiguousByTarget.set(a.target, (ambiguousByTarget.get(a.target) ?? 0) + 1);
    }
  }
  for (const g of input.godNodes) {
    const ambiguousCount = ambiguousByTarget.get(g.slug) ?? 0;
    if (ambiguousCount >= GOD_NODE_AMBIGUOUS_THRESHOLD) {
      out.push({
        kind: 'god_node_disambiguation',
        message: `${g.title} is referenced ${g.inboundCount} times, but ${ambiguousCount} of those edges are uncertain — clarify what this concept means.`,
        actionable: { slugs: [g.slug] },
        severity: 'medium',
      });
    }
  }

  // Bridge elaboration: bridges that span 3+ communities are valuable
  for (const b of input.bridgeNodes) {
    if (b.communityCount >= BRIDGE_ELABORATION_MIN_COMMUNITIES) {
      out.push({
        kind: 'bridge_elaboration',
        message: `${b.title} connects ${b.communityCount} otherwise-separate knowledge clusters — consider elaborating on its cross-domain role.`,
        actionable: { slugs: [b.slug] },
        severity: 'low',
      });
    }
  }

  // Sort by severity desc, then preserve insertion order
  const severityRank = { high: 0, medium: 1, low: 2 } as const;
  out.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return out.slice(0, opts.max ?? DEFAULT_MAX);
}
