// apps/mcp/src/tools/synthesize-topic.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { runSynthesisMCP, topicKey } from '../lib/synthesis-runner.js';

const inputSchema = z.object({
  topic: z.string().min(1),
  force_refresh: z.boolean().optional().default(false),
});

export const definition = {
  name: 'synthesize_topic',
  description:
    "Synthesize what the user's wiki collectively knows about a topic. Returns structured threads with row-level citations, contradictions, and gaps. Cached; pass force_refresh: true to regenerate.",
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Topic to synthesize (slug or free text)' },
      force_refresh: { type: 'boolean' },
    },
    required: ['topic'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success)
    return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { topic, force_refresh } = parsed.data;
  try {
    const key = topicKey(topic);
    if (!force_refresh) {
      const cached = await ctx.synthesisCache.readSynthesis(key);
      if (cached) return textResult(cached);
    }
    const result = await runSynthesisMCP(ctx, topic);
    await ctx.synthesisCache.writeSynthesis(key, result);
    return textResult(result);
  } catch (e) {
    return errorResult(`synthesize_topic failed: ${(e as Error).message}`);
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
