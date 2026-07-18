// packages/core/src/graph/analysis.ts
import type {
  BrokenLink, BridgeInfo, CohesionInfo, HubInfo, OrphanAdjacent, PageGraph, SurprisingEdge,
} from './types';

const SPECIAL_PAGES = new Set(['INDEX', 'log', 'hot', '_insights']);

export function getHubs(graph: PageGraph, topN = 10): HubInfo[] {
  const arr: HubInfo[] = [];
  for (const [slug, node] of graph.nodes) {
    const inc = graph.incoming.get(slug)?.length ?? 0;
    const out = graph.outgoing.get(slug)?.length ?? 0;
    arr.push({
      slug, title: node.title, incoming: inc, outgoing: out,
      role: out > 5 ? 'connector' : 'sink',
    });
  }
  arr.sort((a, b) => b.incoming - a.incoming);
  return arr.filter((h) => h.incoming > 0).slice(0, topN);
}

export function getOrphans(graph: PageGraph): string[] {
  const out: string[] = [];
  for (const [slug] of graph.nodes) {
    if (SPECIAL_PAGES.has(slug)) continue;
    const inc = graph.incoming.get(slug)?.length ?? 0;
    if (inc === 0) out.push(slug);
  }
  return out;
}

export function getBrokenLinks(graph: PageGraph): BrokenLink[] {
  return graph.edges
    .filter((e) => e.broken)
    .map((e) => ({ source: e.source, target: e.target }));
}

export function getOrphanAdjacent(graph: PageGraph): OrphanAdjacent[] {
  const hubs = new Set(getHubs(graph, 10).map((h) => h.slug));
  const out: OrphanAdjacent[] = [];
  for (const [slug, node] of graph.nodes) {
    const outDeg = graph.outgoing.get(slug)?.length ?? 0;
    if (outDeg !== 0) continue;
    const incomingFromHubs = (graph.incoming.get(slug) ?? []).filter((s) => hubs.has(s));
    if (incomingFromHubs.length > 0) {
      out.push({ slug, title: node.title, linkedFrom: incomingFromHubs });
    }
  }
  return out;
}

export function getCohesion(graph: PageGraph): { cohesive: CohesionInfo[]; fragmented: CohesionInfo[] } {
  // Group pages by tag
  const tagPages = new Map<string, string[]>();
  for (const [slug, node] of graph.nodes) {
    for (const tag of node.tags) {
      if (!tagPages.has(tag)) tagPages.set(tag, []);
      tagPages.get(tag)!.push(slug);
    }
  }

  const all: CohesionInfo[] = [];
  for (const [tag, slugs] of tagPages) {
    if (slugs.length < 3) continue;
    const inGroup = new Set(slugs);
    let actualLinks = 0;
    for (const s of slugs) {
      for (const t of graph.outgoing.get(s) ?? []) {
        if (inGroup.has(t)) actualLinks++;
      }
    }
    const maxPossible = (slugs.length * (slugs.length - 1)) / 2;
    const score = maxPossible > 0 ? actualLinks / maxPossible : 0;
    all.push({ tag, pageCount: slugs.length, score });
  }
  all.sort((a, b) => b.score - a.score);
  return {
    cohesive: all.filter((c) => c.score >= 0.15).slice(0, 5),
    fragmented: all.filter((c) => c.score < 0.15).slice(0, 5),
  };
}

export function getBridges(graph: PageGraph, topN = 5): BridgeInfo[] {
  const out: BridgeInfo[] = [];
  for (const [slug, node] of graph.nodes) {
    const neighbors = new Set([
      ...(graph.incoming.get(slug) ?? []),
      ...(graph.outgoing.get(slug) ?? []),
    ]);
    if (neighbors.size < 2) continue;

    // Find pairs of neighbors that share no tags
    const neighborArr = [...neighbors];
    let pairs = 0;
    const tagsByNeighbor = new Map<string, Set<string>>();
    for (const n of neighborArr) {
      tagsByNeighbor.set(n, new Set(graph.nodes.get(n)?.tags ?? []));
    }
    for (let i = 0; i < neighborArr.length; i++) {
      for (let j = i + 1; j < neighborArr.length; j++) {
        const a = neighborArr[i]!;
        const b = neighborArr[j]!;
        const aTags = tagsByNeighbor.get(a)!;
        const bTags = tagsByNeighbor.get(b)!;
        const shared = [...aTags].some((t) => bTags.has(t));
        if (!shared) pairs++;
      }
    }
    if (pairs > 0) {
      // Build "bridges A ↔ B" label from first pair's tags
      const sample = neighborArr.slice(0, 2);
      const aTags = [...(tagsByNeighbor.get(sample[0]!) ?? [])];
      const bTags = [...(tagsByNeighbor.get(sample[1]!) ?? [])];
      const bridges = `${aTags[0] ?? sample[0]} ↔ ${bTags[0] ?? sample[1]}`;
      out.push({ slug, title: node.title, bridges, pairCount: pairs });
    }
  }
  out.sort((a, b) => b.pairCount - a.pairCount);
  return out.slice(0, topN);
}

export function getSurprising(graph: PageGraph, topN = 5): SurprisingEdge[] {
  const out: SurprisingEdge[] = [];
  for (const e of graph.edges) {
    if (e.broken) continue;
    const src = graph.nodes.get(e.source);
    const tgt = graph.nodes.get(e.target);
    if (!src || !tgt) continue;
    if (src.category === tgt.category) continue;

    let score = 0;
    const reasons: string[] = [];
    if (e.confidence === 'ambiguous') { score += 3; reasons.push('ambiguous claim'); }
    if (e.confidence === 'inferred') { score += 2; reasons.push('inferred'); }
    if (src.category !== tgt.category) { score += 2; reasons.push(`cross-layer ${src.category}→${tgt.category}`); }
    const srcDegree = (graph.outgoing.get(e.source)?.length ?? 0) + (graph.incoming.get(e.source)?.length ?? 0);
    const tgtDegree = (graph.outgoing.get(e.target)?.length ?? 0) + (graph.incoming.get(e.target)?.length ?? 0);
    if (srcDegree <= 2 && tgtDegree >= 8) { score += 2; reasons.push('peripheral→hub'); }

    if (score > 0) {
      out.push({ source: e.source, target: e.target, reason: reasons.join(', '), score });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, topN);
}
