// apps/mcp/src/tools/save-chat-excerpt.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { slugify, type MetaJson } from '@mindbase/core';

const inputSchema = z.object({
  content: z.string().min(1),
  suggested_title: z.string().optional(),
  source_chat_id: z.string().optional(),
});

export const definition = {
  name: 'save_chat_excerpt',
  description: 'Save a fragment of the current AI conversation as a wiki page. LLM auto-titles it if no suggested_title. Marks `created_via: mcp` for audit.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      suggested_title: { type: 'string' },
      source_chat_id: { type: 'string' },
    },
    required: ['content'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { content, suggested_title, source_chat_id } = parsed.data;
  if (!ctx.config) return errorResult('LLM not configured', 'Open MindBase Settings to configure your LLM.');

  try {
    let title = suggested_title?.trim() ?? '';
    if (!title || title.length > 80) {
      const adapter = ctx.getAdapter();
      let gen = '';
      for await (const chunk of adapter.chat({
        model: ctx.config.model,
        messages: [{ role: 'user', content: `<system-reminder>Generate a short title (max 8 words) for the following knowledge note. Output only the title, nothing else.</system-reminder>\n\n${content.slice(0, 1000)}` }],
        max_tokens: 30,
        temperature: 0.2,
      })) {
        if (chunk.kind === 'delta') gen += chunk.text;
      }
      title = gen.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '').trim() || 'Untitled Note';
    }

    const slug = slugify(title);
    const mdPath = `wiki/notes/${slug}.md`;
    const metaPath = `wiki/notes/${slug}.meta.json`;
    const now = new Date().toISOString();

    await ctx.store.writeText(mdPath, `# ${title}\n\n${content}\n`);
    const meta: MetaJson & { created_via?: string; mcp_client?: string; mcp_tool?: string } = {
      id: `note-${slug}`,
      type: 'concept',
      title,
      created: now,
      updated: now,
      sources: source_chat_id ? [`chat:${source_chat_id}`] : [],
      related: [],
      one_liner: title,
      word_count: content.split(/\s+/).length,
      compile_version: 1,
      edit_state: 'auto',
      last_human_edit: null,
      created_via: 'mcp',
      mcp_client: ctx.mcpClient,
      mcp_tool: 'save_chat_excerpt',
    };
    await ctx.store.writeJSON(metaPath, meta);

    // Update INDEX.md
    let indexBody = '';
    try { indexBody = await ctx.store.readText('wiki/INDEX.md'); }
    catch { indexBody = '# MindBase Wiki Index\n\n'; }
    if (!indexBody.includes(`${slug}.md`)) {
      indexBody = `${indexBody.trimEnd()}\n- [${title}](${mdPath}) — ${title}\n`;
      await ctx.store.writeText('wiki/INDEX.md', indexBody);
    }

    await ctx.reindex();
    return textResult({ slug, title, path: mdPath });
  } catch (e) {
    return errorResult(`save_chat_excerpt failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
