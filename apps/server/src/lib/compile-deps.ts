import type { ServerContext } from '../context.js';
import { hybridSearch, type HybridResult } from '@mindbase/core';
import { embed } from './embedder.js';

/**
 * Build a hybridSearch closure for compileL1, sharing the server's
 * searchIndex / embeddingStore / store / wikiIndex dependencies.
 */
export function makeHybridSearchClosure(
  ctx: ServerContext,
): (query: string, limit: number) => Promise<HybridResult[]> {
  return async (query, limit) => {
    return hybridSearch({
      query: { q: query, limit },
      searchIndex: ctx.searchIndex,
      embeddingStore: ctx.embeddingStore,
      embedFn: embed,
      store: ctx.store,
      k: limit,
      pageStats: (slug: string) => {
        const p = ctx.wikiIndex.getPage(slug);
        return p
          ? { inboundCount: p.inbound_count, updatedAt: p.updated_at, title: p.title }
          : null;
      },
    });
  };
}
