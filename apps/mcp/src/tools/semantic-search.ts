// apps/mcp/src/tools/semantic-search.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import type { MetaJson } from '@mindbase/core';

const inputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(50).optional().default(10),
});

export const definition = {
  name: 'semantic_search',
  description: 'Embedding-based semantic search across the wiki. Falls back to keyword search if embeddings are unavailable.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['query'],
  },
};

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; ma += a[i]! * a[i]!; mb += b[i]! * b[i]!; }
  return dot / (Math.sqrt(ma) * Math.sqrt(mb) || 1);
}

async function getEmbeddings(texts: string[], baseUrl: string, apiKey: string): Promise<number[][]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/embeddings`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  });
  if (!r.ok) throw new Error(`Embeddings API: HTTP ${r.status}`);
  const data = await r.json() as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { query, limit } = parsed.data;
  if (!ctx.config) return errorResult('LLM not configured', 'Open MindBase Settings to set up your LLM provider.');

  try {
    const entries = await ctx.store.listDir('wiki/notes');
    const pages: Array<{ slug: string; title: string; content: string }> = [];
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
      const slug = entry.name.replace(/\.md$/, '');
      const body = await ctx.store.readText(`wiki/notes/${entry.name}`);
      let title = slug;
      try {
        const m = await ctx.store.readJSON<MetaJson>(`wiki/notes/${slug}.meta.json`);
        title = m.title;
      } catch { /* ok */ }
      pages.push({ slug, title, content: body.slice(0, 1000) });
    }
    if (pages.length === 0) return textResult([]);

    const baseUrl = ctx.config.baseUrl || 'https://api.openai.com';
    const texts = [query, ...pages.map((p) => `${p.title}: ${p.content}`)];
    const embeds = await getEmbeddings(texts, baseUrl, ctx.config.apiKey);
    const queryEmb = embeds[0]!;
    const scored = pages.map((p, i) => ({
      slug: p.slug,
      title: p.title,
      one_liner: '',
      score: cosineSim(queryEmb, embeds[i + 1]!),
    }));
    scored.sort((a, b) => b.score - a.score);
    return textResult(scored.slice(0, limit));
  } catch (e) {
    // Fallback to keyword search
    const keyword = ctx.searchIndex.search(query).slice(0, limit);
    const results = await Promise.all(keyword.map(async (h) => {
      const slug = h.path.replace(/^wiki\/notes\//, '').replace(/\.md$/, '');
      let title = slug;
      try {
        const m = await ctx.store.readJSON<MetaJson>(`wiki/notes/${slug}.meta.json`);
        title = m.title;
      } catch { /* ok */ }
      return { slug, title, one_liner: '', score: h.score };
    }));
    return textResult(results);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
