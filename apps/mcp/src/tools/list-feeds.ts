// apps/mcp/src/tools/list-feeds.ts
import type { Context } from '../context.js';
import { textResult } from '../lib/error.js';

export const definition = {
  name: 'list_feeds',
  description:
    'List all RSS feeds the user is subscribed to, with stats (last poll time, items ingested, errors). Use this when the user asks "what feeds am I subscribed to?" or wants to check their RSS subscriptions.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handle(ctx: Context, _rawInput: unknown) {
  const feeds = await ctx.feeds.summaries();
  return textResult({ feeds });
}

export function register(
  handlers: Map<string, (input: unknown) => Promise<unknown>>,
  defs: object[],
  ctx: Context,
): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
