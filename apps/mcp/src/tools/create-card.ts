// apps/mcp/src/tools/create-card.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult } from '../lib/error.js';

const inputSchema = z.object({
  question: z.string().min(5),
  answer: z.string().min(2),
  source_slug: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const definition = {
  name: 'create_card',
  description:
    'Create a new review card manually. Use this when you and the user have just discussed a fact worth remembering long-term, e.g. "add this to my reviews". The card will be scheduled for review immediately.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'A specific, answerable question (min 5 chars)' },
      answer: { type: 'string', description: 'A concise answer (1-2 sentences, min 2 chars)' },
      source_slug: { type: 'string', description: 'Optional wiki page slug the card relates to' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
    },
    required: ['question', 'answer'],
  },
};

export async function handle(ctx: Context, raw: unknown) {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { content: [{ type: 'text' as const, text: `Invalid input: ${parsed.error.message}` }], isError: true };
  }
  const { question, answer, source_slug, tags } = parsed.data;
  const card = await ctx.cards.create({
    question,
    answer,
    source_slug,
    tags,
    created_via: 'manual',
  });
  return textResult({ card });
}

export function register(
  handlers: Map<string, (input: unknown) => Promise<unknown>>,
  defs: object[],
  ctx: Context,
): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
