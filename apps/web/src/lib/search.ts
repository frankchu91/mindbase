/**
 * Client-side search utilities.
 * Operator parsing + hybrid search API caller.
 *
 * NOTE: @xenova/transformers is NOT imported here. All embedding happens server-side.
 */

export interface SearchFilters {
  tags?: string[];
  project?: string;
  since_days?: number;
  type?: string;
}

export interface SnippetResult {
  text: string;
  highlights: Array<[number, number]>;
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

export interface FederatedResult {
  id: string;
  title: string;
  snippet: string;
  source: 'inbox' | 'chat';
}

export interface SearchResponse {
  results: HybridResult[];
  query_used: { q: string; filters: SearchFilters };
  index_status: { indexed: number; total: number };
  federated?: {
    inbox: FederatedResult[];
    chats: FederatedResult[];
  };
}

/**
 * Parse operator syntax from query string.
 * Extracts tag:, since:, type:, project: operators into filters.
 */
export function parseOperators(raw: string): { q: string; filters: SearchFilters } {
  let q = raw;
  const filters: SearchFilters = {};

  q = q.replace(/\btag:(\S+)/g, (_, v) => {
    (filters.tags ??= []).push(v as string);
    return '';
  });
  q = q.replace(/\bsince:(\d+)d\b/g, (_, v) => {
    filters.since_days = parseInt(v as string, 10);
    return '';
  });
  q = q.replace(/\btype:(\S+)/g, (_, v) => {
    filters.type = v as string;
    return '';
  });
  q = q.replace(/\bproject:(\S+)/g, (_, v) => {
    filters.project = v as string;
    return '';
  });

  return { q: q.replace(/\s+/g, ' ').trim(), filters };
}

/**
 * Call POST /api/search/hybrid.
 * Throws on network/server error.
 */
export async function hybridSearch(
  q: string,
  options: { limit?: number; filters?: SearchFilters; federate?: boolean; signal?: AbortSignal } = {},
): Promise<SearchResponse> {
  const { q: cleanQ, filters: parsedFilters } = parseOperators(q);
  const mergedFilters: SearchFilters = {
    ...options.filters,
    ...parsedFilters,
    tags: [...(options.filters?.tags ?? []), ...(parsedFilters.tags ?? [])],
  };

  const r = await fetch('/api/search/hybrid', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      q: cleanQ || q,
      limit: options.limit ?? 8,
      filters: mergedFilters,
      federate: options.federate ?? false,
    }),
    signal: options.signal,
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Search failed: ${r.status} ${text}`);
  }

  return r.json() as Promise<SearchResponse>;
}

/**
 * Fetch zero-result recovery suggestions (expansions + did-you-mean).
 */
export async function fetchSuggestions(
  q: string,
  signal?: AbortSignal,
): Promise<{ expansions: string[]; suggestions: Array<{ slug: string; title: string }> }> {
  try {
    const r = await fetch('/api/search/expand-or-suggest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q }),
      signal,
    });
    if (!r.ok) return { expansions: [], suggestions: [] };
    return r.json();
  } catch {
    return { expansions: [], suggestions: [] };
  }
}
