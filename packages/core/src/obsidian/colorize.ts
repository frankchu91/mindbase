import type { PageGraph } from '../graph/types';

const PALETTE = [
  { hex: '#4E79A7', rgb: 5142951 },
  { hex: '#F28E2B', rgb: 15896107 },
  { hex: '#E15759', rgb: 14767961 },
  { hex: '#76B7B2', rgb: 7780786 },
  { hex: '#59A14F', rgb: 5873999 },
  { hex: '#EDC948', rgb: 15583048 },
  { hex: '#B07AA1', rgb: 11565217 },
  { hex: '#FF9DA7', rgb: 16751527 },
  { hex: '#9C755F', rgb: 10253663 },
  { hex: '#BAB0AC', rgb: 12234924 },
];

export type ColorizeMode = 'by-tag' | 'by-category' | 'by-visibility';

interface ColorGroup { query: string; color: { a: number; rgb: number } }

/** Build colorGroups array for the given mode by scanning the graph */
export function buildColorGroups(graph: PageGraph, mode: ColorizeMode): ColorGroup[] {
  const groups: ColorGroup[] = [];

  if (mode === 'by-tag') {
    const tagCounts = new Map<string, number>();
    for (const [, node] of graph.nodes) {
      for (const tag of node.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);
    topTags.forEach((tag, i) => {
      groups.push({ query: `tag:#${tag}`, color: { a: 1, rgb: PALETTE[i % PALETTE.length]!.rgb } });
    });
  } else if (mode === 'by-category') {
    const categories = new Set<string>();
    for (const [, node] of graph.nodes) categories.add(node.category);
    [...categories].forEach((cat, i) => {
      groups.push({ query: `path:"${cat}"`, color: { a: 1, rgb: PALETTE[i % PALETTE.length]!.rgb } });
    });
  } else if (mode === 'by-visibility') {
    groups.push({ query: 'tag:#visibility/pii', color: { a: 1, rgb: PALETTE[2]!.rgb } }); // red
    groups.push({ query: 'tag:#visibility/internal', color: { a: 1, rgb: PALETTE[1]!.rgb } }); // orange
  }

  return groups;
}

/** Merge colorGroups into existing graph.json content (preserving other settings) */
export function mergeIntoGraphJson(existing: string | null, groups: ColorGroup[]): string {
  let parsed: Record<string, unknown> = {};
  if (existing) {
    try { parsed = JSON.parse(existing); } catch { /* start fresh */ }
  }
  parsed['colorGroups'] = groups;
  return JSON.stringify(parsed, null, 2);
}
