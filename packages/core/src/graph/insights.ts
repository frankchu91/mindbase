// packages/core/src/graph/insights.ts
import type { Store } from '../storage/store';
import type { InsightsDelta, InsightsReport, PageGraph } from './types';
import {
  getBridges, getBrokenLinks, getCohesion, getHubs, getOrphanAdjacent, getOrphans, getSurprising,
} from './analysis';

interface Snapshot {
  nodes: string[];
  edges: Array<[string, string]>;
}

const SNAPSHOT_RE = /<!--\s*GRAPH_SNAPSHOT:\s*(\{[\s\S]*?\})\s*-->/;

async function loadPreviousSnapshot(store: Store): Promise<Snapshot | null> {
  try {
    const prev = await store.readText('wiki/_insights.md');
    const m = prev.match(SNAPSHOT_RE);
    if (!m) return null;
    return JSON.parse(m[1]!) as Snapshot;
  } catch {
    return null;
  }
}

function snapshotFromGraph(graph: PageGraph): Snapshot {
  return {
    nodes: [...graph.nodes.keys()].sort(),
    edges: graph.edges.filter((e) => !e.broken).map((e) => [e.source, e.target] as [string, string]),
  };
}

function computeDelta(prev: Snapshot, curr: Snapshot): InsightsDelta {
  const prevNodes = new Set(prev.nodes);
  const currNodes = new Set(curr.nodes);
  const newPages = [...currNodes].filter((n) => !prevNodes.has(n));
  const removedPages = [...prevNodes].filter((n) => !currNodes.has(n));

  const edgeKey = (e: [string, string]) => `${e[0]}->${e[1]}`;
  const prevEdges = new Set(prev.edges.map(edgeKey));
  const currEdges = new Set(curr.edges.map(edgeKey));
  const newLinks = [...currEdges].filter((e) => !prevEdges.has(e));
  const removedLinks = [...prevEdges].filter((e) => !currEdges.has(e));

  // Newly connected: pages that had 0 incoming before, now have ≥1
  const prevIncoming = new Map<string, number>();
  for (const [, t] of prev.edges) prevIncoming.set(t, (prevIncoming.get(t) ?? 0) + 1);
  const currIncoming = new Map<string, number>();
  for (const [, t] of curr.edges) currIncoming.set(t, (currIncoming.get(t) ?? 0) + 1);
  const newlyConnected = [...currIncoming.keys()].filter(
    (n) => (prevIncoming.get(n) ?? 0) === 0 && currIncoming.get(n)! > 0,
  );
  const lostIncoming = [...prevIncoming.keys()].filter(
    (n) => (prevIncoming.get(n) ?? 0) > 0 && (currIncoming.get(n) ?? 0) === 0,
  );

  return {
    newPages: newPages.length,
    removedPages: removedPages.length,
    newLinks: newLinks.length,
    removedLinks: removedLinks.length,
    newlyConnected,
    lostIncoming,
  };
}

function buildQuestions(report: Omit<InsightsReport, 'questions'>): string[] {
  const qs: string[] = [];
  for (const b of report.bridges.slice(0, 2)) {
    qs.push(`Explore: Why does ${b.slug} bridge ${b.bridges}?`);
  }
  for (const o of report.orphans.slice(0, 2)) {
    qs.push(`Link: ${o} has no incoming links — what should reference it?`);
  }
  for (const c of report.cohesion.fragmented.slice(0, 2)) {
    qs.push(`Audit: Should tag #${c.tag} be split? (cohesion ${c.score.toFixed(2)}, ${c.pageCount} pages)`);
  }
  return qs.slice(0, 7);
}

export async function generateInsights(graph: PageGraph, store: Store): Promise<InsightsReport> {
  const hubs = getHubs(graph);
  const bridges = getBridges(graph);
  const cohesion = getCohesion(graph);
  const surprising = getSurprising(graph);
  const orphanAdjacent = getOrphanAdjacent(graph);
  const orphans = getOrphans(graph);
  const brokenLinks = getBrokenLinks(graph);

  let delta: InsightsDelta | undefined;
  const prev = await loadPreviousSnapshot(store);
  if (prev) {
    delta = computeDelta(prev, snapshotFromGraph(graph));
  }

  const partial = {
    generatedAt: new Date().toISOString(),
    pageCount: graph.nodes.size,
    edgeCount: graph.edges.length,
    hubs, bridges, cohesion, surprising, orphanAdjacent, orphans, brokenLinks, delta,
  };
  return { ...partial, questions: buildQuestions(partial) };
}

export function renderInsightsMarkdown(report: InsightsReport, graph: PageGraph): string {
  const lines: string[] = [];
  lines.push(`# Wiki Insights — ${report.generatedAt}`);
  lines.push('');
  lines.push(`**${report.pageCount} pages · ${report.edgeCount} links**`);
  lines.push('');

  if (report.hubs.length > 0) {
    lines.push('## Top Hubs');
    lines.push('| Page | Incoming | Outgoing | Role |');
    lines.push('|---|---|---|---|');
    for (const h of report.hubs) {
      lines.push(`| [[${h.slug}]] | ${h.incoming} | ${h.outgoing} | ${h.role} |`);
    }
    lines.push('');
  }

  if (report.bridges.length > 0) {
    lines.push('## Bridge Pages');
    for (const b of report.bridges) {
      lines.push(`- [[${b.slug}]] bridges ${b.bridges} (${b.pairCount} pairs)`);
    }
    lines.push('');
  }

  if (report.cohesion.fragmented.length > 0) {
    lines.push('## Fragmented Tags (cross-linker candidates)');
    for (const c of report.cohesion.fragmented) {
      lines.push(`- #${c.tag} — ${c.pageCount} pages, cohesion ${c.score.toFixed(2)}`);
    }
    lines.push('');
  }

  if (report.surprising.length > 0) {
    lines.push('## Surprising Connections');
    for (const s of report.surprising) {
      lines.push(`- [[${s.source}]] → [[${s.target}]] — score ${s.score} (${s.reason})`);
    }
    lines.push('');
  }

  if (report.orphans.length > 0) {
    lines.push(`## Orphans (${report.orphans.length})`);
    for (const o of report.orphans.slice(0, 20)) {
      lines.push(`- [[${o}]]`);
    }
    if (report.orphans.length > 20) lines.push(`- ... and ${report.orphans.length - 20} more`);
    lines.push('');
  }

  if (report.brokenLinks.length > 0) {
    lines.push(`## Broken Links (${report.brokenLinks.length})`);
    for (const b of report.brokenLinks.slice(0, 20)) {
      lines.push(`- [[${b.source}]] → ${b.target} (missing)`);
    }
    lines.push('');
  }

  if (report.delta) {
    lines.push('## Delta Since Last Run');
    lines.push(`- +${report.delta.newPages} pages, +${report.delta.newLinks} links`);
    lines.push(`- -${report.delta.removedPages} pages, -${report.delta.removedLinks} links`);
    if (report.delta.newlyConnected.length > 0) {
      lines.push(`- Newly connected: ${report.delta.newlyConnected.slice(0, 5).map((s) => `[[${s}]]`).join(', ')}`);
    }
    lines.push('');
  }

  if (report.questions.length > 0) {
    lines.push('## Questions Worth Asking');
    for (let i = 0; i < report.questions.length; i++) {
      lines.push(`${i + 1}. ${report.questions[i]}`);
    }
    lines.push('');
  }

  // Embed full graph snapshot for next-run delta computation
  const snapshot = {
    nodes: [...graph.nodes.keys()],
    edges: graph.edges.filter((e) => !e.broken).map((e) => [e.source, e.target] as [string, string]),
  };
  lines.push(`<!-- GRAPH_SNAPSHOT: ${JSON.stringify(snapshot)} -->`);

  return lines.join('\n');
}
