// apps/mcp/src/tools/find-gaps.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { runSynthesisMCP, topicKey } from '../lib/synthesis-runner.js';

const inputSchema = z.object({ topic: z.string().min(1) });

export const definition = {
  name: 'find_gaps',
  description:
    "Find gaps in the wiki's coverage of a topic. Returns LLM-suggested missing pieces (e.g., \"you mention X but never document Y\").",
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
    if (cached) return textResult({ topic, gaps: cached.gaps });
    const result = await runSynthesisMCP(ctx, topic);
    await ctx.synthesisCache.writeSynthesis(key, result);
    return textResult({ topic, gaps: result.gaps });
  } catch (e) {
    return errorResult(`find_gaps failed: ${(e as Error).message}`);
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
