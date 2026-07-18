// apps/mcp/src/tools/find-contradictions.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { runSynthesisMCP, topicKey } from '../lib/synthesis-runner.js';

const inputSchema = z.object({ topic: z.string().min(1) });

export const definition = {
  name: 'find_contradictions',
  description:
    'Find self-contradictions in the wiki on a given topic. Returns only contradictions, no full synthesis. Useful when the user wants to reconcile evolving views.',
  inputSchema: {
    type: 'object',
    properties: { topic: { type: 'string' } },
    required: ['topic'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success)
    return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { topic } = parsed.data;
  try {
    const key = topicKey(topic);
    const cached = await ctx.synthesisCache.readSynthesis(key);
    if (cached) return textResult({ topic, contradictions: cached.contradictions });
    const result = await runSynthesisMCP(ctx, topic);
    await ctx.synthesisCache.writeSynthesis(key, result);
    return textResult({ topic, contradictions: result.contradictions });
  } catch (e) {
    return errorResult(`find_contradictions failed: ${(e as Error).message}`);
  }
}

export function register(
  handlers: Map<string, (input: unknown) => Promise<unknown>>,
  defs: object[],
  ctx: Context,
): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
