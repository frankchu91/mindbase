// apps/mcp/src/tools/suggest-links.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { crossLink } from '@mindbase/core';

const inputSchema = z.object({ slug: z.string().min(1) });

export const definition = {
  name: 'suggest_links',
  description: 'Suggest wikilinks that should be added to a specific page (review mode — does NOT modify the page).',
  inputSchema: {
    type: 'object',
    properties: { slug: { type: 'string' } },
    required: ['slug'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { slug } = parsed.data;

  try {
    const result = await crossLink(ctx.store, { mode: 'review' });
    const filtered = result.suggestions
      .filter((s) => s.page === slug && s.confidence !== 'ambiguous')
      .map((s) => ({ target: s.target, confidence: s.confidence, reason: s.reason, snippet: s.snippet }));
    return textResult(filtered);
  } catch (e) {
    return errorResult(`suggest_links failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
