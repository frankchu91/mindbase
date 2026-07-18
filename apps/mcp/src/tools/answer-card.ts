// apps/mcp/src/tools/answer-card.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult } from '../lib/error.js';

const inputSchema = z.object({
  id: z.string(),
  rating: z.enum(['forgot', 'hard', 'good', 'easy']),
});

export const definition = {
  name: 'answer_card',
  description:
    'Submit an answer to a review card. Use ratings as: forgot (didn\'t know), hard (struggled), good (right answer with effort), easy (instant recall). After answering, the card is rescheduled according to SM-2.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The card ID to answer' },
      rating: {
        type: 'string',
        enum: ['forgot', 'hard', 'good', 'easy'],
        description: 'Your self-assessment: forgot, hard, good, or easy',
      },
    },
    required: ['id', 'rating'],
  },
};

export async function handle(ctx: Context, raw: unknown) {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { content: [{ type: 'text' as const, text: `Invalid input: ${parsed.error.message}` }], isError: true };
  }
  const { id, rating } = parsed.data;
  try {
    const card = await ctx.cards.answer(id, rating);
    return textResult({ card, next_due: card.due_at });
  } catch (e) {
    return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
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
