// apps/mcp/src/tools/recall-chat.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';

interface ChatSession {
  id: string;
  title: string;
  updated: string;
  messages: Array<{ role: string; text: string }>;
}

const inputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(50).optional().default(10),
});

export const definition = {
  name: 'recall_chat',
  description: 'Search past saved chat conversations by content. Returns matching chats with previews.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['query'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { query, limit } = parsed.data;
  const q = query.toLowerCase();

  try {
    const entries = await ctx.store.listDir('chats');
    const out: Array<{ id: string; title: string; updated: string; preview: string }> = [];
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
      try {
        const s = await ctx.store.readJSON<ChatSession>(`chats/${entry.name}`);
        const inTitle = s.title.toLowerCase().includes(q);
        let preview = '';
        for (const m of s.messages) {
          if (m.text.toLowerCase().includes(q)) {
            const idx = m.text.toLowerCase().indexOf(q);
            preview = '…' + m.text.slice(Math.max(0, idx - 60), Math.min(m.text.length, idx + 100)) + '…';
            break;
          }
        }
        if (inTitle || preview) {
          out.push({ id: s.id, title: s.title, updated: s.updated, preview: preview || s.messages[0]?.text.slice(0, 160) || '' });
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
