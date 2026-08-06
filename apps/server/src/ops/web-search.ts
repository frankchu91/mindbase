// apps/server/src/ops/web-search.ts
//
// Optional Brave Search integration for the research op. No key → the
// caller falls back to wiki-only mode; failures degrade to fewer sources
// rather than failing the op.
import type { ResearchSource } from './recipes/research';

const RESULT_COUNT = 3;
const PAGE_CHAR_CAP = 5_000;
const FETCH_TIMEOUT_MS = 10_000;

interface BraveResult { title: string; url: string; description?: string }

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|#160);/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Top Brave results with readable page text; failed fetches fall back to the result snippet. */
export async function braveSearchSources(apiKey: string, query: string): Promise<ResearchSource[]> {
  const r = await fetchWithTimeout(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${RESULT_COUNT}`,
    { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' } },
  );
  if (!r.ok) throw new Error(`Brave Search ${r.status}: check your key in Settings`);
  const data = (await r.json()) as { web?: { results?: BraveResult[] } };
  const results = (data.web?.results ?? []).slice(0, RESULT_COUNT);
  return Promise.all(
    results.map(async (res) => {
      const host = new URL(res.url).hostname;
      try {
        const page = await fetchWithTimeout(res.url, { headers: { 'User-Agent': 'MindBase-research/1.0' } });
        const text = stripHtml(await page.text()).slice(0, PAGE_CHAR_CAP);
        return { label: `web — ${host} (${res.url})`, body: text || res.description || res.title };
      } catch {
        return { label: `web — ${host} (${res.url})`, body: res.description ?? res.title };
      }
    }),
  );
}
