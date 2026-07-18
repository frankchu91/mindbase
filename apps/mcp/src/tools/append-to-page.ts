// apps/mcp/src/tools/append-to-page.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import type { MetaJson } from '@mindbase/core';

const inputSchema = z.object({
  slug: z.string().min(1),
  section: z.string().min(1),
  content: z.string().min(1),
  force: z.boolean().optional().default(false),
});

export const definition = {
  name: 'append_to_page',
  description: 'Append content to a section of an existing wiki page. Creates the section if missing. Refuses to modify human-edited pages unless force: true.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      section: { type: 'string', description: 'Heading text (without ##)' },
      content: { type: 'string' },
      force: { type: 'boolean', description: 'Bypass human_touched guard (default false)' },
    },
    required: ['slug', 'section', 'content'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { slug, section, content, force } = parsed.data;

  try {
    const mdPath = `wiki/notes/${slug}.md`;
    const metaPath = `wiki/notes/${slug}.meta.json`;
    let body: string;
    try { body = await ctx.store.readText(mdPath); }
    catch { return errorResult(`Page not found: '${slug}'`); }

    let meta: MetaJson | null = null;
    try { meta = await ctx.store.readJSON<MetaJson>(metaPath); } catch { /* ok */ }
    if (meta?.edit_state === 'human_touched' && !force) {
      return errorResult(`Page '${slug}' has been edited by a human`, 'Pass force: true to override.', { edit_state: meta.edit_state });
    }

    const before = body.length;
    const sectionRe = new RegExp(`(##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n)([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
    if (sectionRe.test(body)) {
      body = body.replace(sectionRe, (_full, header, sectionBody) => `${header}${sectionBody.trimEnd()}\n\n${content}\n`);
    } else {
      body = `${body.trimEnd()}\n\n## ${section}\n\n${content}\n`;
    }

    await ctx.store.writeText(mdPath, body);
    if (meta) {
      meta.updated = new Date().toISOString();
      meta.word_count = body.split(/\s+/).length;
      await ctx.store.writeJSON(metaPath, meta);
    }
    await ctx.reindex();
    return textResult({ slug, bytes_added: body.length - before });
  } catch (e) {
    return errorResult(`append_to_page failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
