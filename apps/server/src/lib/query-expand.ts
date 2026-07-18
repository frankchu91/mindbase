import type { ServerContext } from '../context';
import type { EmbeddingStore } from '@mindbase/core';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i]! * b[i]!;
  return dot; // normalized vectors → dot = cosine
}

/**
 * LLM-driven query expansion.
 * Returns up to 3 alternative phrasings for the given query.
 * Falls back to [] on any error so callers can always use it safely.
 *
 * Note: did-you-mean uses full-body embeddings (not title-only) — this is fine
 * for a PKM where titles are short and bodies carry most of the signal.
 */
export async function expandQuery(q: string, ctx: ServerContext): Promise<string[]> {
  try {
    const adapter = ctx.getAdapter();
    const prompt = `Rewrite this personal wiki search query into 3 alternative phrasings. Return a JSON array of strings only, no explanation.\n\nQuery: ${q}`;
    let raw = '';
    for await (const chunk of adapter.chat({
      model: ctx.config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256,
      temperature: 0.7,
    })) {
      if (chunk.kind === 'delta') raw += chunk.text;
    }
    // Extract JSON array from the response
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string').slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Semantic "did you mean" using full-body embeddings.
 * Returns top 3 most similar pages by cosine similarity to the query embedding.
 */
export async function didYouMean(
  q: string,
  embeddingStore: EmbeddingStore,
  embedFn: (text: string) => Promise<number[]>,
): Promise<Array<{ slug: string; title: string }>> {
  try {
    const [qVec, all] = await Promise.all([
      embedFn(q),
      embeddingStore.list(),
    ]);
    if (qVec.length === 0 || all.length === 0) return [];

    const scored = all
      .map((e) => ({
        slug: e.slug,
        score: cosineSimilarity(qVec, e.vector),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return scored.map((s) => ({ slug: s.slug, title: s.slug.replace(/-/g, ' ') }));
  } catch {
    return [];
  }
}
