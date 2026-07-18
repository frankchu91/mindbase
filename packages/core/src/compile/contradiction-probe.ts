import type { Store } from '../storage/store';
import type { WikiIndex } from '../graph/index/wiki-index';

export interface ContradictionCandidate {
  slugA: string;
  slugB: string;
  signal: 'cue';
  cueSnippet?: string;
}

const CONTRAST_CUE_RE = /\b(vs\.?|versus|unlike|contrary to|contradicts?)\s+\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/gi;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-');
}

/**
 * Scan all wiki pages for contradiction-suggesting cues and return up to
 * `maxCandidates` (slugA, slugB) pairs to feed to the LLM judge.
 *
 * Each unique pair is returned at most once even if multiple cues fire.
 * Pairs where slugB doesn't exist in the index are skipped (broken links
 * don't deserve LLM calls).
 */
export async function findContradictionCandidates(
  store: Store,
  index: WikiIndex,
  opts: { maxCandidates: number },
): Promise<ContradictionCandidate[]> {
  const seen = new Set<string>();
  const out: ContradictionCandidate[] = [];

  for (const page of index.allPages()) {
    let body: string;
    try { body = await store.readText(page.path); }
    catch { continue; }

    CONTRAST_CUE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CONTRAST_CUE_RE.exec(body)) !== null) {
      const targetSlug = slugify(m[2]!);
      if (!targetSlug) continue;
      if (!index.getPage(targetSlug)) continue;
      if (targetSlug === page.slug) continue;

      const [a, b] = [page.slug, targetSlug].sort();
      const key = `${a}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const snippetStart = Math.max(0, m.index - 60);
      const snippetEnd = Math.min(body.length, m.index + m[0].length + 60);
      out.push({
        slugA: a!,
        slugB: b!,
        signal: 'cue',
        cueSnippet: body.slice(snippetStart, snippetEnd),
      });

      if (out.length >= opts.maxCandidates) return out;
    }
  }

  return out;
}

// ─── Task 10: LLM judge ────────────────────────────────────────────────────

import type { LLMAdapter } from '../adapters/types';

export const CONTRADICTION_JUDGE_PROMPT_VERSION = 'judge/v1';

const CONTRADICTION_JUDGE_PROMPT = `You are a fact-checker. You will be given two wiki pages from a personal knowledge base. Decide whether they CONTRADICT each other on any specific factual claim.

Output strict JSON:
{
  "verdict": "contradicts" | "compatible" | "unrelated",
  "reason": "one short sentence explaining"
}

- "contradicts" = the two pages assert directly opposing facts about the same subject
- "compatible" = both pages discuss the same subject but their claims agree or do not collide
- "unrelated" = the pages discuss substantially different subjects; no conflict possible

Be strict — only return "contradicts" if there is a specific factual collision you can point at.`;

export type Verdict = 'contradicts' | 'compatible' | 'unrelated';

export interface JudgeResult {
  verdict: Verdict;
  reason: string;
}

async function collectChat(
  adapter: LLMAdapter,
  model: string,
  system: string,
  user: string,
): Promise<{ content: string }> {
  let content = '';
  const stream = adapter.chat({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  for await (const chunk of stream) {
    if (chunk.kind === 'delta') content += chunk.text;
  }
  return { content };
}

/**
 * Single-shot LLM judge over a page pair. Returns 'contradicts' / 'compatible'
 * / 'unrelated'. Defensive: missing pages, malformed JSON → 'unrelated'.
 */
export async function judgeContradictionPair(
  adapter: LLMAdapter,
  model: string,
  store: Store,
  slugA: string,
  slugB: string,
): Promise<JudgeResult> {
  let bodyA = '';
  let bodyB = '';
  try { bodyA = await store.readText(`wiki/notes/${slugA}.md`); }
  catch { return { verdict: 'unrelated', reason: 'page A not found' }; }
  try { bodyB = await store.readText(`wiki/notes/${slugB}.md`); }
  catch { return { verdict: 'unrelated', reason: 'page B not found' }; }

  const A = bodyA.slice(0, 4000);
  const B = bodyB.slice(0, 4000);
  const user = `<page slug="${slugA}">\n${A}\n</page>\n\n<page slug="${slugB}">\n${B}\n</page>`;

  let resp: { content: string };
  try { resp = await collectChat(adapter, model, CONTRADICTION_JUDGE_PROMPT, user); }
  catch (err) { return { verdict: 'unrelated', reason: `adapter error: ${(err as Error).message}` }; }

  let jsonStr = resp.content.trim();
  const fence = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) jsonStr = fence[1]!.trim();
  const braceStart = jsonStr.indexOf('{');
  const braceEnd = jsonStr.lastIndexOf('}');
  if (braceStart === -1 || braceEnd === -1) return { verdict: 'unrelated', reason: 'malformed response' };
  try {
    const parsed = JSON.parse(jsonStr.slice(braceStart, braceEnd + 1)) as Partial<JudgeResult>;
    const v = parsed.verdict;
    if (v !== 'contradicts' && v !== 'compatible' && v !== 'unrelated') {
      return { verdict: 'unrelated', reason: 'invalid verdict' };
    }
    return { verdict: v, reason: parsed.reason ?? '' };
  } catch {
    return { verdict: 'unrelated', reason: 'json parse failed' };
  }
}

// ─── Task 11: Orchestrator ─────────────────────────────────────────────────

export interface RunContradictionProbeOptions {
  store: Store;
  wikiIndex: WikiIndex;
  adapter: LLMAdapter;
  model: string;
  maxCandidates?: number;
}

export interface RunContradictionProbeResult {
  judged: number;
  cached: number;
}

export async function runContradictionProbe(
  opts: RunContradictionProbeOptions,
): Promise<RunContradictionProbeResult> {
  const maxCandidates = opts.maxCandidates ?? 20;
  const candidates = await findContradictionCandidates(opts.store, opts.wikiIndex, { maxCandidates });
  const cache = opts.wikiIndex.contradictionCache();
  let judged = 0;
  let cached = 0;

  for (const candidate of candidates) {
    const existing = cache.get(
      candidate.slugA,
      candidate.slugB,
      opts.model,
      CONTRADICTION_JUDGE_PROMPT_VERSION,
    );
    if (existing) { cached++; continue; }
    const judgment = await judgeContradictionPair(
      opts.adapter,
      opts.model,
      opts.store,
      candidate.slugA,
      candidate.slugB,
    );
    cache.put({
      slugA: candidate.slugA,
      slugB: candidate.slugB,
      modelId: opts.model,
      promptVersion: CONTRADICTION_JUDGE_PROMPT_VERSION,
      verdict: judgment.verdict,
      reason: judgment.reason,
    });
    judged++;
  }

  return { judged, cached };
}
