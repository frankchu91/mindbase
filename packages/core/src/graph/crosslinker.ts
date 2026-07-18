// packages/core/src/graph/crosslinker.ts
import type { Store } from '../storage/store';
import type { EdgeConfidence } from './types';
import { buildGraph } from './builder';

export interface CrossLinkSuggestion {
  page: string;       // slug
  target: string;     // target slug
  snippet: string;    // surrounding text
  confidence: EdgeConfidence;
  score: number;
  reason: string;
  applied: boolean;
}

export interface CrossLinkResult {
  suggestions: CrossLinkSuggestion[];
  applied: number;
  pagesModified: string[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip code blocks and frontmatter from text for matching */
function stripUnlinkable(text: string): string {
  return text
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '');
}

export async function crossLink(
  store: Store,
  opts: { mode: 'auto' | 'review' },
): Promise<CrossLinkResult> {
  const graph = await buildGraph(store);
  const suggestions: CrossLinkSuggestion[] = [];
  let applied = 0;
  const pagesModified = new Set<string>();

  // Build set of titles already linked from each page
  const alreadyLinked = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (!alreadyLinked.has(e.source)) alreadyLinked.set(e.source, new Set());
    alreadyLinked.get(e.source)!.add(e.target);
  }

  for (const [pageSlug, pageNode] of graph.nodes) {
    let body: string;
    try { body = await store.readText(pageNode.path); } catch { continue; }
    const stripped = stripUnlinkable(body);
    const linkedSet = alreadyLinked.get(pageSlug) ?? new Set();
    let modifiedBody = body;
    let pageHadEdit = false;

    for (const [otherSlug, otherNode] of graph.nodes) {
      if (otherSlug === pageSlug) continue;
      if (linkedSet.has(otherSlug)) continue;

      // Check for exact title mention (whole-word, case-insensitive) outside code/frontmatter
      const titlePattern = new RegExp(`\\b${escapeRegex(otherNode.title)}\\b`, 'i');
      if (!titlePattern.test(stripped)) continue;

      // Score: exact title match starts at 6 (EXTRACTED threshold) so a plain
      // exact-title mention is always at least EXTRACTED, with bonuses pushing
      // it higher. Partial / tag-only mentions start lower (see plan scoring).
      let score = 6; // exact title match (+6 per plan, guarantees EXTRACTED)
      const reasons: string[] = ['exact title match'];

      const sharedTags = pageNode.tags.filter((t) => otherNode.tags.includes(t));
      if (sharedTags.length >= 2) { score += 2; reasons.push(`shared tags: ${sharedTags.join(',')}`); }
      if (pageNode.project && pageNode.project === otherNode.project) { score += 2; reasons.push('same project'); }
      if (pageNode.category !== otherNode.category) { score += 2; reasons.push('cross-category'); }

      const pageDeg = (graph.outgoing.get(pageSlug)?.length ?? 0) + (graph.incoming.get(pageSlug)?.length ?? 0);
      const otherDeg = (graph.outgoing.get(otherSlug)?.length ?? 0) + (graph.incoming.get(otherSlug)?.length ?? 0);
      if (pageDeg <= 2 && otherDeg >= 8) { score += 2; reasons.push('peripheral→hub'); }

      const confidence: EdgeConfidence = score >= 6 ? 'extracted' : score >= 3 ? 'inferred' : 'ambiguous';

      // Snippet
      const matchIdx = stripped.toLowerCase().indexOf(otherNode.title.toLowerCase());
      const snippet = matchIdx >= 0
        ? stripped.slice(Math.max(0, matchIdx - 30), Math.min(stripped.length, matchIdx + otherNode.title.length + 30))
        : '';

      const suggestion: CrossLinkSuggestion = {
        page: pageSlug,
        target: otherSlug,
        snippet,
        confidence,
        score,
        reason: reasons.join(', '),
        applied: false,
      };

      // Apply only in auto mode and only EXTRACTED
      if (opts.mode === 'auto' && confidence === 'extracted') {
        // Replace first whole-word occurrence in modifiedBody
        const wordRe = new RegExp(`\\b(${escapeRegex(otherNode.title)})\\b`, 'i');
        // Don't replace inside code blocks: do manual scan
        const before = modifiedBody;
        modifiedBody = replaceFirstOutsideCode(modifiedBody, wordRe, `[[${otherNode.title}]]`);
        if (modifiedBody !== before) {
          suggestion.applied = true;
          applied++;
          pageHadEdit = true;
          // Mark this target as now linked for subsequent iterations on same page
          linkedSet.add(otherSlug);
        }
      }

      suggestions.push(suggestion);
    }

    if (pageHadEdit) {
      await store.writeText(pageNode.path, modifiedBody);
      pagesModified.add(pageSlug);
    }
  }

  return { suggestions, applied, pagesModified: [...pagesModified] };
}

/** Replace the first whole-word match outside code blocks. */
function replaceFirstOutsideCode(body: string, re: RegExp, replacement: string): string {
  // Split into segments: code blocks and non-code
  const segs: Array<{ text: string; code: boolean }> = [];
  let i = 0;
  const fenceRe = /```[\s\S]*?```|`[^`]*`/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(body)) !== null) {
    if (m.index > i) segs.push({ text: body.slice(i, m.index), code: false });
    segs.push({ text: m[0], code: true });
    i = m.index + m[0].length;
  }
  if (i < body.length) segs.push({ text: body.slice(i), code: false });

  for (const seg of segs) {
    if (seg.code) continue;
    if (re.test(seg.text)) {
      seg.text = seg.text.replace(re, replacement);
      return segs.map((s) => s.text).join('');
    }
  }
  return body;
}
