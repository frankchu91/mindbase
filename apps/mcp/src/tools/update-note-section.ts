// apps/mcp/src/tools/update-note-section.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import type { MetaJson } from '@mindbase/core';

const inputSchema = z.object({
  slug: z.string().min(1),
  section: z.string().min(1),
  new_content: z.string(),
  force: z.boolean().optional().default(false),
});

export const definition = {
  name: 'update_note_section',
  description: 'Replace the content under a section heading on an existing page. Refuses to modify human-edited pages unless force: true.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      section: { type: 'string' },
      new_content: { type: 'string' },
      force: { type: 'boolean' },
    },
    required: ['slug', 'section', 'new_content'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { slug, section, new_content, force } = parsed.data;

  try {
    const mdPath = `wiki/notes/${slug}.md`;
    const metaPath = `wiki/notes/${slug}.meta.json`;
    let body: string;
    try { body = await ctx.store.readText(mdPath); }
    catch { return errorResult(`Page not found: '${slug}'`); }

    let meta: MetaJson | null = null;
    try { meta = await ctx.store.readJSON<MetaJson>(metaPath); } catch { /* ok */ }
    if (meta?.edit_state === 'human_touched' && !force) {
      return errorResult(`Page '${slug}' has been edited by a human`, 'Pass force: true to override.');
    }

    const sectionRe = new RegExp(`(##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n)([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
    if (!sectionRe.test(body)) {
      return errorResult(`Section '${section}' not found in page '${slug}'`, 'Use append_to_page to create new sections.');
    }
    body = body.replace(sectionRe, (_full, header) => `${header}\n${new_content}\n`);

    await ctx.store.writeText(mdPath, body);
    if (meta) {
      meta.updated = new Date().toISOString();
      meta.word_count = body.split(/\s+/).length;
      await ctx.store.writeJSON(metaPath, meta);
    }
    await ctx.reindex();
    return textResult({ slug });
  } catch (e) {
    return errorResult(`update_note_section failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
