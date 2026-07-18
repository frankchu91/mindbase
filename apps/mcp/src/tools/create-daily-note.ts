import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { createOrOpenDaily } from '@mindbase/core';

const inputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const definition = {
  name: 'create_daily_note',
  description:
    'Open or create the daily note for today (or a specific date). Daily notes follow the slug pattern `daily-YYYY-MM-DD` and are auto-linked to yesterday/tomorrow. ' +
    'Returns the existing page if already created, marking `created: false`.',
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'ISO date YYYY-MM-DD (default: today server-local)' },
    },
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  try {
    const result = await createOrOpenDaily(ctx.store, ctx.templates, {
      isoDate: parsed.data.date,
      createdVia: 'mcp',
      mcpClient: ctx.mcpClient,
      mcpTool: 'create_daily_note',
    });
    if (result.created) await ctx.reindex();
    return textResult({ slug: result.slug, path: result.path, created: result.created, title: result.meta.title });
  } catch (e) {
    return errorResult(`create_daily_note failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
