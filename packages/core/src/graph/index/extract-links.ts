export type LinkConfidence = 'extracted' | 'inferred' | 'ambiguous';

export interface ExtractedLink {
  target: string;              // slugified target
  confidence: LinkConfidence;
  contextSnippet?: string;     // ±120 chars surrounding the [[ ]] occurrence
  /** Heading text of the nearest H2/H3 ancestor section, or null if before any heading. */
  section: string | null;
}

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
const CONTEXT_RADIUS = 120;

function slugifyPart(part: string): string {
  return part.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-');
}

/**
 * Slugify a wikilink target. A target with a single `/` separator is treated
 * as `project/slug` and each side is slugified independently (e.g.
 * `[[LOTR/Aragorn the King]]` → `lotr/aragorn-the-king`). Anything else is
 * one piece, slugified as before.
 */
function slugify(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0 && slash === name.lastIndexOf('/') && slash < name.length - 1) {
    const proj = slugifyPart(name.slice(0, slash));
    const slug = slugifyPart(name.slice(slash + 1));
    if (proj && slug) return `${proj}/${slug}`;
  }
  return slugifyPart(name);
}

function stripUnlinkable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')   // fenced code blocks
    .replace(/`[^`]*`/g, '');         // inline code spans
}

/**
 * Promote confidence to the strongest of two values.
 * Order: extracted < inferred < ambiguous (ambiguous wins because it flags a question).
 */
function strongerConfidence(a: LinkConfidence, b: LinkConfidence): LinkConfidence {
  const rank = { extracted: 0, inferred: 1, ambiguous: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Extract all `[[wikilink]]` occurrences from `body`. Returns one entry per
 * unique target slug; if a target is referenced multiple times with different
 * confidence markers, the strongest marker wins.
 *
 * Context snippet: ±120 chars around the first occurrence, used as
 * `links.context_snippet` for downstream type inference (Phase 2).
 */
export function extractWikilinks(body: string): ExtractedLink[] {
  const stripped = stripUnlinkable(body);
  const byTarget = new Map<string, ExtractedLink>();

  // Build a sorted list of [offset, sectionName] from H2/H3 headings.
  // Inside code blocks they're already gone (stripped).
  const sectionMarks: Array<{ offset: number; name: string }> = [];
  const headingRe = /^(#{2,3})\s+(.+?)\s*$/gm;
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(stripped)) !== null) {
    const name = hm[2]!.replace(/[:.,;!?]+\s*$/, '').trim();
    sectionMarks.push({ offset: hm.index, name });
  }
  function sectionAt(offset: number): string | null {
    let current: string | null = null;
    for (const m of sectionMarks) {
      if (m.offset < offset) current = m.name;
      else break;
    }
    return current;
  }

  WIKILINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_RE.exec(stripped)) !== null) {
    const rawTarget = m[1]!;
    const target = slugify(rawTarget);
    if (!target) continue;

    const lineStart = stripped.lastIndexOf('\n', m.index) + 1;
    const lineEndIdx = stripped.indexOf('\n', m.index);
    const line = stripped.slice(lineStart, lineEndIdx === -1 ? undefined : lineEndIdx);
    let confidence: LinkConfidence = 'extracted';
    if (line.includes('^[ambiguous]')) confidence = 'ambiguous';
    else if (line.includes('^[inferred]')) confidence = 'inferred';

    const ctxStart = Math.max(0, m.index - CONTEXT_RADIUS);
    const ctxEnd = Math.min(stripped.length, m.index + m[0].length + CONTEXT_RADIUS);
    const contextSnippet = stripped.slice(ctxStart, ctxEnd);
    const section = sectionAt(m.index);

    const existing = byTarget.get(target);
    if (existing) {
      existing.confidence = strongerConfidence(existing.confidence, confidence);
    } else {
      byTarget.set(target, { target, confidence, contextSnippet, section });
    }
  }

  return Array.from(byTarget.values());
}
