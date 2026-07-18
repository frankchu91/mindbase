// apps/mcp/src/tools/list-review-cards.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult } from '../lib/error.js';

const inputSchema = z.object({
  due_only: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const definition = {
  name: 'list_review_cards',
  description:
    'List spaced-repetition review cards. By default returns cards due now (due_only=true). Use this to conduct an interactive review session: list due cards, present each Q to the user, wait for their answer, call answer_card, repeat.',
  inputSchema: {
    type: 'object',
    properties: {
      due_only: { type: 'boolean', description: 'If true, only cards due now (default true)' },
      limit: { type: 'number', description: 'Max cards to return (default 20, max 100)' },
    },
  },
};

export async function handle(ctx: Context, raw: unknown) {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { content: [{ type: 'text' as const, text: 'Invalid input' }], isError: true };
  const { due_only, limit } = parsed.data;
  if (due_only) {
    const r = await ctx.cards.findDue(new Date(), limit);
    return textResult({ cards: r.cards, total_due: r.total });
  }
  const all = await ctx.cards.list();
  return textResult({ cards: all.slice(0, limit), total: all.length });
}

export function register(
  handlers: Map<string, (input: unknown) => Promise<unknown>>,
  defs: object[],
  ctx: Context,
): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
