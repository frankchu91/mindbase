// apps/mcp/src/tools/tag-note.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import type { MetaJson } from '@mindbase/core';

const inputSchema = z.object({
  slug: z.string().min(1),
  tags: z.array(z.string()).min(1),
  mode: z.enum(['add', 'replace']).optional().default('add'),
});

export const definition = {
  name: 'tag_note',
  description: 'Add or replace tags on a wiki page. mode: "add" merges with existing tags (default); "replace" overwrites.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      mode: { type: 'string', enum: ['add', 'replace'] },
    },
    required: ['slug', 'tags'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { slug, tags, mode } = parsed.data;

  try {
    const metaPath = `wiki/notes/${slug}.meta.json`;
    let meta: (MetaJson & { tags?: string[] });
    try { meta = await ctx.store.readJSON<MetaJson & { tags?: string[] }>(metaPath); }
    catch { return errorResult(`Page not found: '${slug}'`); }

    const final = mode === 'replace' ? [...new Set(tags)] : [...new Set([...(meta.tags ?? []), ...tags])];
    meta.tags = final;
    meta.updated = new Date().toISOString();
    await ctx.store.writeJSON(metaPath, meta);
    return textResult({ slug, tags: final });
  } catch (e) {
    return errorResult(`tag_note failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
