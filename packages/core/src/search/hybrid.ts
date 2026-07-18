import type { SearchIndex } from './index';
import type { EmbeddingStore } from './embedding-store';
import { cosineSimilarity } from './embeddings';
import type { Store } from '../storage/store';
import type { MetaJson } from '../types';
import { backlinkBoost, recencyBoost, exactMatchBoost } from './retrieval-signals';

export interface SearchFilters {
  tags?: string[];
  project?: string;
  since_days?: number;
  type?: string;
}

export interface HybridQuery {
  q: string;
  limit?: number;
  filters?: SearchFilters;
}

export interface SnippetResult {
  text: string;
  highlights: Array<[number, number]>; // [start, end] byte offsets
}

export interface HybridResult {
  slug: string;
  path: string;
  title: string;
  one_liner: string;
  score: number;
  bm25_rank: number | null;
  vec_rank: number | null;
  snippet: SnippetResult;
  tags?: string[];
  updated?: string;
  type?: string;
}

/** Reciprocal Rank Fusion constant — 60 is standard */
const RRF_K = 60;

/**
 * Parse operator syntax from query string.
 * Extracts tag:, since:, type:, project: operators into filters.
 * Returns cleaned query string + parsed filters.
 */
export function parseOperators(raw: string): { q: string; filters: SearchFilters } {
  let q = raw;
  const filters: SearchFilters = {};

  q = q.replace(/\btag:(\S+)/g, (_, v) => {
    (filters.tags ??= []).push(v);
    return '';
  });
  q = q.replace(/\bsince:(\d+)d\b/g, (_, v) => {
    filters.since_days = parseInt(v, 10);
    return '';
  });
  q = q.replace(/\btype:(\S+)/g, (_, v) => {
    filters.type = v;
    return '';
  });
  q = q.replace(/\bproject:(\S+)/g, (_, v) => {
    filters.project = v;
    return '';
  });

  return { q: q.replace(/\s+/g, ' ').trim(), filters };
}

/**
 * Extract a ~200-char snippet from body text around the first token match.
 * Returns the snippet text + highlight [start, end] offsets within that text.
 */
export function extractSnippet(body: string, tokens: string[]): SnippetResult {
  if (!body || tokens.length === 0) {
    return { text: body.slice(0, 200), highlights: [] };
  }

  const bodyLower = body.toLowerCase();
  let bestIdx = -1;

  // Find the first occurrence of any query token
  for (const token of tokens) {
    if (!token || token.length < 1) continue;
    const idx = bodyLower.indexOf(token.toLowerCase());
    if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) {
      bestIdx = idx;
    }
  }

  // Window ~200 chars around the match (or start if no match)
  const windowStart = bestIdx < 0 ? 0 : Math.max(0, bestIdx - 80);
  const windowEnd = Math.min(body.length, windowStart + 200);
  const snippet = body.slice(windowStart, windowEnd);
  const snippetLower = snippet.toLowerCase();

  // Compute highlight offsets within the snippet
  const highlights: Array<[number, number]> = [];
  for (const token of tokens) {
    if (!token || token.length < 2) continue; // skip single-char tokens to reduce noise
    const tLower = token.toLowerCase();
    let pos = 0;
    while (pos < snippetLower.length) {
      const found = snippetLower.indexOf(tLower, pos);
      if (found < 0) break;
      highlights.push([found, found + token.length]);
      pos = found + token.length;
    }
  }

  // Sort and de-overlap highlights
  highlights.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const h of highlights) {
    const last = merged[merged.length - 1];
    if (last && h[0] <= last[1]) {
      last[1] = Math.max(last[1], h[1]); // extend
    } else {
      merged.push(h);
    }
  }

  return { text: snippet, highlights: merged };
}

/**
 * Hybrid search combining BM25 (MiniSearch) + dense vector (BGE-M3) via RRF.
 *
 * Steps:
 * 1. Run BM25 search → top 20
 * 2. Run cosine similarity against all stored embeddings → top 20
 * 3. Apply filters (tags, project, since_days, type)
 * 4. RRF merge: score = Σ 1/(60 + rank_i)
 * 5. For top K, load body and extract snippet with highlights
 */
export async function hybridSearch(args: {
  query: HybridQuery;
  searchIndex: SearchIndex;
  embeddingStore: EmbeddingStore;
  embedFn: (text: string) => Promise<number[]>;
  store: Store;
  k?: number;
  /**
   * Phase 2: per-slug stats used by the boost layer. When provided, the
   * base RRF score is multiplied by backlinkBoost × recencyBoost ×
   * exactMatchBoost. When omitted, hybridSearch behaves as in Phase 1.
   */
  pageStats?: (slug: string) => { inboundCount: number; updatedAt: string | null; title: string | null } | null;
}): Promise<HybridResult[]> {
  const { query, searchIndex, embeddingStore, embedFn, store, k = 8 } = args;
  const limit = query.limit ?? k;
  const filters = query.filters ?? {};

  const parsed = parseOperators(query.q);
  const cleanQ = parsed.q;
  // Merge operator-parsed filters with explicit filters
  const effectiveFilters: SearchFilters = {
    ...filters,
    ...parsed.filters,
    tags: [...(filters.tags ?? []), ...(parsed.filters.tags ?? [])].filter(
      (v, i, a) => a.indexOf(v) === i,
    ),
  };

  if (!cleanQ.trim()) return [];

  // Run BM25 and dense retrieval in parallel
  const [bm25Results, allEmbeddings, queryVec] = await Promise.all([
    Promise.resolve(searchIndex.search(cleanQ).slice(0, 20)),
    embeddingStore.list(),
    embedFn(cleanQ).catch(() => [] as number[]),
  ]);

  // Compute cosine scores for all stored embeddings
  let vecResults: Array<{ slug: string; score: number }> = [];
  if (queryVec.length > 0 && allEmbeddings.length > 0) {
    vecResults = allEmbeddings
      .map((e) => ({
        slug: e.slug,
        score: cosineSimilarity(queryVec, e.vector),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }

  // Build rank maps
  const bm25RankMap = new Map<string, number>(); // slug → 0-indexed rank
  for (let i = 0; i < bm25Results.length; i++) {
    const r = bm25Results[i]!;
    const slug = r.path.replace(/^wiki\/notes\//, '').replace(/\.md$/, '');
    bm25RankMap.set(slug, i);
  }

  const vecRankMap = new Map<string, number>(); // slug → 0-indexed rank
  for (let i = 0; i < vecResults.length; i++) {
    vecRankMap.set(vecResults[i]!.slug, i);
  }

  // Collect all candidate slugs
  const allSlugs = new Set<string>([
    ...bm25RankMap.keys(),
    ...vecRankMap.keys(),
  ]);

  // RRF scoring
  const scored: Array<{ slug: string; score: number; bm25_rank: number | null; vec_rank: number | null }> = [];
  for (const slug of allSlugs) {
    const bm25Rank = bm25RankMap.has(slug) ? bm25RankMap.get(slug)! : null;
    const vecRank = vecRankMap.has(slug) ? vecRankMap.get(slug)! : null;
    let score = 0;
    if (bm25Rank !== null) score += 1 / (RRF_K + bm25Rank);
    if (vecRank !== null) score += 1 / (RRF_K + vecRank);
    scored.push({ slug, score, bm25_rank: bm25Rank, vec_rank: vecRank });
  }

  // Phase 2: apply backlink + recency + exact-match boosts when stats available.
  if (args.pageStats) {
    const now = new Date();
    for (const s of scored) {
      const stats = args.pageStats(s.slug);
      if (!stats) continue;
      s.score *=
        backlinkBoost(stats.inboundCount) *
        recencyBoost(stats.updatedAt, now) *
        exactMatchBoost(cleanQ, stats.title);
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Load metadata for filtering and building results
  const cutoffDate = effectiveFilters.since_days
    ? new Date(Date.now() - effectiveFilters.since_days * 86_400_000)
    : null;

  const results: HybridResult[] = [];

  for (const candidate of scored) {
    if (results.length >= limit) break;

    const { slug } = candidate;
    const metaPath = `wiki/notes/${slug}.meta.json`;
    let meta: Partial<MetaJson & { tags?: string[] }> = {};
    try {
      meta = await store.readJSON<MetaJson & { tags?: string[] }>(metaPath);
    } catch { /* no meta */ }

    // Apply filters
    if (effectiveFilters.tags && effectiveFilters.tags.length > 0) {
      const pageTags: string[] = (meta as { tags?: string[] }).tags ?? [];
      const hasTag = effectiveFilters.tags.some((t) => pageTags.includes(t));
      if (!hasTag) continue;
    }

    if (effectiveFilters.project) {
      if (meta.project !== effectiveFilters.project) continue;
    }

    if (effectiveFilters.type) {
      if (meta.type !== effectiveFilters.type) continue;
    }

    if (cutoffDate && meta.updated) {
      const updated = new Date(meta.updated);
      if (updated < cutoffDate) continue;
    }

    // Load body for snippet
    let body = '';
    try {
      body = await store.readText(`wiki/notes/${slug}.md`);
    } catch { /* no body */ }

    // Tokenize query for snippet highlighting (simple split for display)
    const tokens = cleanQ.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    const snippet = extractSnippet(body, tokens);

    results.push({
      slug,
      path: `wiki/notes/${slug}.md`,
      title: meta.title ?? slug,
      one_liner: meta.one_liner ?? '',
      score: candidate.score,
      bm25_rank: candidate.bm25_rank,
      vec_rank: candidate.vec_rank,
      snippet,
      tags: (meta as { tags?: string[] }).tags,
      updated: meta.updated,
      type: meta.type,
    });
  }

  return results;
}
