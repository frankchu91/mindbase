// apps/mcp/src/tools/set-visibility.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import type { MetaJson } from '@mindbase/core';

const inputSchema = z.object({
  slug: z.string().min(1),
  level: z.enum(['public', 'internal', 'pii']),
});

export const definition = {
  name: 'set_visibility',
  description: 'Set the visibility level of a wiki page. "internal" and "pii" pages are excluded from semantic search and Q&A by default.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      level: { type: 'string', enum: ['public', 'internal', 'pii'] },
    },
    required: ['slug', 'level'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { slug, level } = parsed.data;

  try {
    const metaPath = `wiki/notes/${slug}.meta.json`;
    let meta: (MetaJson & { visibility?: string });
    try { meta = await ctx.store.readJSON<MetaJson & { visibility?: string }>(metaPath); }
    catch { return errorResult(`Page not found: '${slug}'`); }

    meta.visibility = level;
    meta.updated = new Date().toISOString();
    await ctx.store.writeJSON(metaPath, meta);
    return textResult({ slug, visibility: level });
  } catch (e) {
    return errorResult(`set_visibility failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
