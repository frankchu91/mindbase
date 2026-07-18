import { hybridSearch, buildMissingLinksPrompt, paths } from '@mindbase/core';
import type { NetworkView, NetworkMissingLink } from '@mindbase/core';
import type { ServerContext } from '../context';
import { embed } from './embedder';
import { extractJson } from './extract-json';

function makePageStats(ctx: ServerContext) {
  return (slug: string) => {
    const p = ctx.wikiIndex.getPage(slug);
    if (!p) return null;
    return { inboundCount: p.inbound_count, updatedAt: p.updated_at, title: p.title };
  };
}

/**
 * Engine C — Network. Given a note slug, produces a NetworkView containing:
 *   - semantic_related: semantically similar notes (via hybrid search)
 *   - missing_links: LLM-suggested links not currently present in the note
 *   - mentioned_in: reverse-link scan for notes that wiki-link to this slug
 *
 * Does NOT cache — caller (route handler) reads cache first, calls runNetwork
 * on miss, then writes cache.
 */
export async function runNetwork(ctx: ServerContext, slug: string): Promise<NetworkView> {
  const result: NetworkView = {
    slug,
    generated_at: new Date().toISOString(),
    semantic_related: [],
    missing_links: [],
    contradictions: [],
    mentioned_in: [],
  };

  // 1. Read this note
  let thisBody: string;
  let thisTitle = slug;
  try {
    thisBody = await ctx.store.readText(`wiki/notes/${slug}.md`);
    try {
      const meta = await ctx.store.readJSON<{ title?: string }>(`wiki/notes/${slug}.meta.json`);
      thisTitle = meta.title ?? slug;
    } catch { /* meta missing */ }
  } catch {
    return result; // note missing — empty network
  }

  // 2. Semantic neighbors via hybrid search using this note's body as query
  const queryText = thisBody.slice(0, 500);
  const hits = await hybridSearch({
    query: { q: queryText, limit: 8 },
    searchIndex: ctx.searchIndex,
    embeddingStore: ctx.embeddingStore,
    embedFn: embed,
    store: ctx.store,
    k: 8,
    pageStats: makePageStats(ctx),
  });

  const candidates: Array<{ slug: string; title: string; body: string }> = [];
  for (const h of hits) {
    const otherSlug = h.path.replace(/^wiki\/notes\//, '').replace(/\.md$/, '');
    if (otherSlug === slug) continue;
    try {
      const body = await ctx.store.readText(`wiki/notes/${otherSlug}.md`);
      let title = otherSlug;
      try {
        const meta = await ctx.store.readJSON<{ title?: string }>(`wiki/notes/${otherSlug}.meta.json`);
        title = meta.title ?? otherSlug;
      } catch { /* skip */ }
      candidates.push({ slug: otherSlug, title, body });
      result.semantic_related.push({ slug: otherSlug, similarity: 0.8 });
      if (result.semantic_related.length >= 5) break;
    } catch { /* skip */ }
  }

  // 3. Filter out already-linked candidates (only needed for LLM missing-links step)
  if (candidates.length > 0) {
    const linkRegex = /\[\[([a-z0-9][a-z0-9_-]*)/gi;
    const linked = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(thisBody)) !== null) linked.add(m[1]!.toLowerCase());

    const unlinkedCandidates = candidates.filter((c) => !linked.has(c.slug.toLowerCase()));

    if (unlinkedCandidates.length > 0) {
      // 4. Ask LLM for missing-link suggestions
      const adapter = ctx.getAdapter();
      const candSummaries = unlinkedCandidates.map((c) => ({
        slug: c.slug,
        title: c.title,
        summary: c.body.slice(0, 120),
      }));
      let schemaPreamble = '';
      try {
        schemaPreamble = await ctx.store.readText('schema/synthesis.md');
      } catch { /* default empty preamble */ }
      const prompt = buildMissingLinksPrompt({
        thisNote: { slug, title: thisTitle, body: thisBody },
        candidates: candSummaries,
        schemaPreamble,
      });

      let buf = '';
      try {
        for await (const chunk of adapter.chat({
          model: ctx.config.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 600,
          temperature: 0.2,
        })) {
          if (chunk.kind === 'delta') buf += chunk.text;
        }

        const parsed = extractJson<{ missing_links?: NetworkMissingLink[] }>(buf);
        if (parsed) {
          const known = new Set(candidates.map((c) => c.slug));
          const validLinks = (parsed.missing_links ?? [])
            .filter((ml) => known.has(ml.slug) && (ml.confidence === 'medium' || ml.confidence === 'high'))
            .slice(0, 3);
          result.missing_links = validLinks;
        }
      } catch { /* LLM error → leave missing_links empty */ }
    }
  }

  // 5. Reverse-link scan: which other notes mention [[slug]]?
  try {
    const entries = await paths.listAllWikiPages(ctx.store);
    for (const e of entries) {
      if (e.kind !== 'file' || !e.name.endsWith('.md')) continue;
      const otherSlug = e.name.replace(/\.md$/, '');
      if (otherSlug === slug) continue;
      try {
        const body = await ctx.store.readText(`wiki/${e.layer}/${e.name}`);
        const re = new RegExp(`\\[\\[${slug}(?:\\||\\])`, 'i');
        if (re.test(body)) {
          const ix = body.search(re);
          const snippet = body.slice(Math.max(0, ix - 40), ix + 60).replace(/\s+/g, ' ');
          result.mentioned_in.push({ slug: otherSlug, snippet });
          if (result.mentioned_in.length >= 5) break;
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  return result;
}
