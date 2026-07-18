// apps/mcp/src/tools/search-all-projects.ts
//
// Unified-graph search: queries the wikiIndex across every project. Returns
// qualified slugs (`<project-id>/<slug>`) so the LLM can write
// `[[<project>/<slug>]]` cross-project wikilinks in its answer.
//
// The skill calls this when an open-ended question can't be answered well from
// the current project alone — "have I seen this before", "what do I know about
// X". For project-local searches, use `search_wiki`.
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';

export const inputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(50).optional().default(10),
  /** Optional: only return matches OUTSIDE the current project (cross-project hits). */
  crossProjectOnly: z.boolean().optional().default(false),
});

export const definition = {
  name: 'search_all_projects',
  description:
    "Search the user's wiki across EVERY project (not just the current one). " +
    'Returns ranked matches with their owning project id, suitable for citing as ' +
    '`[[<project>/<slug>]]` cross-project wikilinks. Use this when answering ' +
    'open-ended "have I seen this before" questions or proposing cross-project ' +
    'bridges during ingest.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (1+ chars). Matches against slug, title, and one-liner.' },
      limit: { type: 'number', description: 'Max results to return (default 10, max 50)' },
      crossProjectOnly: {
        type: 'boolean',
        description: 'If true, exclude results from the current project. Useful when looking only for cross-project bridges.',
      },
    },
    required: ['query'],
  },
};

interface ScoredHit {
  slug: string;
  qualifiedSlug: string;
  projectId: string;
  title: string;
  oneLiner: string;
  type: string;
  score: number;
}

function score(needle: string, slug: string, title: string, oneLiner: string): number {
  const q = needle.toLowerCase();
  let s = 0;
  const slugL = slug.toLowerCase();
  const titleL = title.toLowerCase();
  const oneLinerL = oneLiner.toLowerCase();
  // Exact slug match dominates.
  if (slugL === q) s += 10;
  else if (slugL.includes(q)) s += 5;
  // Title hits are strong.
  if (titleL === q) s += 8;
  else if (titleL.includes(q)) s += 4;
  // One-liner is a softer signal.
  if (oneLinerL.includes(q)) s += 2;
  // Token-level fuzzy: each word in the query that appears anywhere adds 0.5.
  for (const word of q.split(/\s+/)) {
    if (word.length < 3) continue;
    if (slugL.includes(word) || titleL.includes(word) || oneLinerL.includes(word)) s += 0.5;
  }
  return s;
}

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  }
  const { query, limit, crossProjectOnly } = parsed.data;

  try {
    const currentProjectId = (ctx as Context & { currentProjectId?: string }).currentProjectId ?? 'default';
    const pages = ctx.wikiIndex.allPages();
    const hits: ScoredHit[] = [];
    for (const p of pages) {
      if (crossProjectOnly && p.project_id === currentProjectId) continue;
      const summary = p.summary ?? '';
      const s = score(query, p.slug, p.title, summary);
      if (s <= 0) continue;
      hits.push({
        slug: p.slug,
        qualifiedSlug: `${p.project_id}/${p.slug}`,
        projectId: p.project_id,
        title: p.title,
        oneLiner: summary,
        type: p.type,
        score: s,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return textResult(hits.slice(0, limit));
  } catch (e) {
    return errorResult(`Cross-project search failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
