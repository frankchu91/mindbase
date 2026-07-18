// packages/core/src/graph/builder.ts
import type { Store } from '../storage/store';
import type { MetaJson } from '../types';
import type { EdgeConfidence, PageEdge, PageGraph, PageNode } from './types';
import { listAllWikiPages } from '../storage/paths';

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function slugifyTarget(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-');
}

/** Extract wikilinks from text. Returns array of { target, confidence } objects. */
function extractLinks(text: string): Array<{ target: string; confidence: EdgeConfidence }> {
  const out: Array<{ target: string; confidence: EdgeConfidence }> = [];
  // Strip code blocks to avoid linking inside them
  const stripped = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '');
  let m: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((m = WIKILINK_RE.exec(stripped)) !== null) {
    const rawTarget = m[1]!;
    const target = slugifyTarget(rawTarget);
    if (!target) continue;
    // Confidence — look at the rest of the same line for ^[inferred] / ^[ambiguous]
    const lineStart = stripped.lastIndexOf('\n', m.index) + 1;
    const lineEnd = stripped.indexOf('\n', m.index);
    const line = stripped.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    let confidence: EdgeConfidence = 'extracted';
    if (line.includes('^[ambiguous]')) confidence = 'ambiguous';
    else if (line.includes('^[inferred]')) confidence = 'inferred';
    out.push({ target, confidence });
  }
  return out;
}

function inferCategory(slug: string, type: string): string {
  if (slug.startsWith('entities/')) return 'entities';
  if (slug.startsWith('concepts/')) return 'concepts';
  if (slug.startsWith('skills/')) return 'skills';
  return type === 'concept' ? 'concepts' : type;
}

/**
 * @deprecated
 *
 * Legacy filesystem-scan implementation. Kept for backward compat with
 * `crosslinker.ts` and existing tests. Production callers should use
 * `WikiIndex.buildGraph()` via the server context — it returns the same
 * PageGraph shape but is O(1) database read instead of O(N) filesystem scan.
 *
 * This export will be removed once Phase 2 lands and crosslinker.ts
 * migrates to the index.
 */
export async function buildGraph(store: Store): Promise<PageGraph> {
  const nodes = new Map<string, PageNode>();
  const edges: PageEdge[] = [];
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  const entries = await listAllWikiPages(store);

  // First pass: build nodes
  const pageBodies = new Map<string, string>();
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
    const slug = entry.name.replace(/\.md$/, '');
    let body = '';
    try {
      body = await store.readText(`wiki/${entry.layer}/${entry.name}`);
    } catch { continue; }
    pageBodies.set(slug, body);

    let meta: MetaJson | null = null;
    try {
      meta = await store.readJSON<MetaJson>(`wiki/${entry.layer}/${slug}.meta.json`);
    } catch { /* no meta — fall back */ }

    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const node: PageNode = {
      slug,
      path: `wiki/notes/${slug}.md`,
      title: meta?.title ?? slug,
      type: meta?.type ?? 'concept',
      tags: [],
      category: inferCategory(slug, meta?.type ?? 'concept'),
      visibility: meta?.visibility,
      project: meta?.project,
      wordCount,
      summary: meta?.one_liner,
      kind: meta?.kind,
    };
    nodes.set(slug, node);
  }

  // Build a title → slug lookup so we can resolve wikilinks by display title
  const titleToSlug = new Map<string, string>();
  for (const [slug, node] of nodes) {
    titleToSlug.set(slugifyTarget(node.title), slug);
  }

  // Second pass: build edges
  for (const [slug, body] of pageBodies) {
    const links = extractLinks(body);
    for (const { target, confidence } of links) {
      // Resolve target: check if any existing node has this slug or matching title-slug
      const resolved = nodes.has(target) ? target : titleToSlug.get(target);
      const finalTarget = resolved ?? target;
      const broken = !nodes.has(finalTarget);
      edges.push({ source: slug, target: finalTarget, confidence, broken, edgeType: 'mentions', inferenceRule: null });

      if (!broken) {
        if (!outgoing.has(slug)) outgoing.set(slug, []);
        outgoing.get(slug)!.push(finalTarget);
        if (!incoming.has(finalTarget)) incoming.set(finalTarget, []);
        incoming.get(finalTarget)!.push(slug);
      }
    }
  }

  // Initialize empty arrays for nodes with no edges
  for (const slug of nodes.keys()) {
    if (!incoming.has(slug)) incoming.set(slug, []);
    if (!outgoing.has(slug)) outgoing.set(slug, []);
  }

  return { nodes, edges, incoming, outgoing };
}
