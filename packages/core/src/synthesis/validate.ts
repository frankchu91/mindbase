import type { Citation, Contradiction, Gap, SynthesisThread } from './types';

interface RawSynthesis {
  summary?: string;
  threads?: Array<{ heading?: string; content?: string; citations?: Citation[] }>;
  contradictions?: Array<{
    with_slug?: string;
    your_claim_excerpt?: string;
    conflicting_claim_excerpt?: string;
    confidence?: 'low' | 'medium' | 'high';
    explanation?: string;
  }>;
  gaps?: Array<{ suggestion?: string; related_notes?: string[] }>;
}

interface ValidatedSynthesis {
  summary: string;
  threads: SynthesisThread[];
  contradictions: Contradiction[];
  gaps: Gap[];
}

function citationValid(c: Citation, sources: Map<string, string[]>): boolean {
  const lines = sources.get(c.slug);
  if (!lines) return false;
  const [start, end] = c.line_range;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  if (start < 1 || end > lines.length || start > end) return false;
  return true;
}

const INLINE_CITE_RE = /\[[a-z0-9][a-z0-9_-]*:\d+(-\d+)?\]/i;

/**
 * Strip uncited sentences when the LLM embedded inline `[slug:N]` markers.
 * If no markers are present at all, trust the thread-level `citations` array
 * and keep the prose intact — the UI renders citation chips after the content
 * regardless of inline markers.
 */
function pruneUncitedSentences(content: string): string {
  if (!INLINE_CITE_RE.test(content)) return content.trim();
  const sentences = content.split(/(?<=[.。!?！？])\s+/);
  const kept = sentences.filter((s) => INLINE_CITE_RE.test(s));
  return kept.join(' ').trim();
}

export function validateSynthesis(
  raw: RawSynthesis,
  sources: Map<string, string[]>,
): ValidatedSynthesis {
  const threads: SynthesisThread[] = [];
  for (const t of raw.threads ?? []) {
    const validCitations = (t.citations ?? []).filter((c) => citationValid(c, sources));
    if (validCitations.length === 0) continue;
    const prunedContent = pruneUncitedSentences(t.content ?? '');
    if (!prunedContent) continue;
    threads.push({
      heading: t.heading ?? '',
      content: prunedContent,
      citations: validCitations,
    });
  }

  const contradictions: Contradiction[] = [];
  for (const c of raw.contradictions ?? []) {
    if (!c.with_slug || !sources.has(c.with_slug)) continue;
    if (c.confidence !== 'low' && c.confidence !== 'medium' && c.confidence !== 'high') continue;
    contradictions.push({
      with_slug: c.with_slug,
      your_claim_excerpt: c.your_claim_excerpt ?? '',
      conflicting_claim_excerpt: c.conflicting_claim_excerpt ?? '',
      confidence: c.confidence,
      explanation: c.explanation,
    });
  }

  const gaps: Gap[] = [];
  for (const g of raw.gaps ?? []) {
    const related = (g.related_notes ?? []).filter((s) => sources.has(s));
    // If user provided related_notes but ALL are unknown, drop the gap entirely.
    // Empty related_notes (none provided) is acceptable.
    if (related.length === 0 && (g.related_notes ?? []).length > 0) continue;
    if (!g.suggestion) continue;
    gaps.push({ suggestion: g.suggestion, related_notes: related });
  }

  return { summary: raw.summary ?? '', threads, contradictions, gaps };
}
