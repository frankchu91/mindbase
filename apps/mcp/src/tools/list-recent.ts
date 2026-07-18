// apps/mcp/src/tools/list-recent.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import type { MetaJson } from '@mindbase/core';

const inputSchema = z.object({
  days: z.number().int().positive().optional().default(7),
  limit: z.number().int().positive().max(100).optional().default(20),
});

export const definition = {
  name: 'list_recent',
  description: 'List wiki pages added or updated within the past N days, newest first.',
  inputSchema: {
    type: 'object',
    properties: {
      days: { type: 'number', description: 'Number of days to look back (default 7)' },
      limit: { type: 'number', description: 'Max pages to return (default 20, max 100)' },
    },
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { days, limit } = parsed.data;

  try {
    const cutoff = Date.now() - days * 86400_000;
    const entries = await ctx.store.listDir('wiki/notes');
    const out: Array<{ slug: string; title: string; one_liner: string; updated: string; type: string }> = [];
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.meta.json')) continue;
      const slug = entry.name.replace(/\.meta\.json$/, '');
      try {
        const meta = await ctx.store.readJSON<MetaJson>(`wiki/notes/${entry.name}`);
        const updated = new Date(meta.updated).getTime();
        if (Number.isFinite(updated) && updated >= cutoff) {
          out.push({ slug, title: meta.title, one_liner: meta.one_liner ?? '', updated: meta.updated, type: meta.type });
        }
      } catch { /* skip malformed */ }
    }
    out.sort((a, b) => b.updated.localeCompare(a.updated));
    return textResult(out.slice(0, limit));
  } catch (e) {
    return errorResult(`list_recent failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
