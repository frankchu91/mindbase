// apps/mcp/src/tools/list-chats.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';

interface ChatSession {
  id: string;
  title: string;
  created: string;
  updated: string;
  messages: Array<{ role: string; text: string }>;
}

const inputSchema = z.object({
  days: z.number().int().positive().optional().default(30),
  limit: z.number().int().positive().max(100).optional().default(20),
});

export const definition = {
  name: 'list_chats',
  description: 'List recent chat sessions saved in MindBase, newest first.',
  inputSchema: {
    type: 'object',
    properties: {
      days: { type: 'number' },
      limit: { type: 'number' },
    },
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { days, limit } = parsed.data;
  const cutoff = Date.now() - days * 86400_000;

  try {
    const out: Array<{ id: string; title: string; updated: string; message_count: number }> = [];
    const entries = await ctx.store.listDir('chats');
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
      try {
        const s = await ctx.store.readJSON<ChatSession>(`chats/${entry.name}`);
        const ts = new Date(s.updated).getTime();
        if (Number.isFinite(ts) && ts >= cutoff) {
          out.push({ id: s.id, title: s.title, updated: s.updated, message_count: s.messages.length });
        }
      } catch { /* skip */ }
    }
    out.sort((a, b) => b.updated.localeCompare(a.updated));
    return textResult(out.slice(0, limit));
  } catch {
    return textResult([]);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
