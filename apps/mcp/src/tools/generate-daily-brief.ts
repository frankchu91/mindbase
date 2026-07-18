// apps/mcp/src/tools/generate-daily-brief.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { buildBrief } from '@mindbase/core';

const inputSchema = z.object({
  since_hours: z.number().min(1).max(168).optional().default(24),
  include_on_this_day: z.boolean().optional().default(false),
});

export const definition = {
  name: 'generate_daily_brief',
  description:
    'Generate a morning brief summarizing recent wiki activity with [N] citations. Default 24h lookback. Does not email — for that use the web UI Settings → Daily Brief → Send Now.',
  inputSchema: {
    type: 'object',
    properties: {
      since_hours: {
        type: 'number',
        description: 'How many hours back to look for recent pages (default 24, max 168)',
      },
      include_on_this_day: {
        type: 'boolean',
        description: 'Include an "On This Day" section for pages created exactly 1w/1m/1y ago',
      },
    },
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  }

  const { since_hours, include_on_this_day } = parsed.data;

  try {
    const adapter = ctx.getAdapter();
    const config = ctx.config;
    if (!config) {
      return errorResult('LLM not configured. Set up an LLM provider first.');
    }

    const brief = await buildBrief(
      {
        store: ctx.store,
        getAdapter: () => adapter,
        config: { model: config.model },
        // MCP context has no inbox access — just skip it
      },
      {
        sinceHours: since_hours,
        includeOnThisDay: include_on_this_day,
      },
    );

    return textResult({
      date: brief.date,
      summary: brief.summary,
      citations: brief.citations.map((c) => ({
        ...c,
        mindbase_uri: `mindbase://wiki/${c.slug}`,
      })),
      sections: brief.sections,
      on_this_day: brief.on_this_day,
      inbox_pending: brief.inbox_pending,
      status: brief.status,
      error: brief.error,
    });
  } catch (e) {
    return errorResult(`generate_daily_brief failed: ${(e as Error).message}`);
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
