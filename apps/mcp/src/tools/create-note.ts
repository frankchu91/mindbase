import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { createNote, SlugConflictError } from '@mindbase/core';

const inputSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).optional(),
  kind: z.string().optional(),
  template: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  project: z.string().optional(),
  variables: z.record(z.string()).optional(),
});

export const definition = {
  name: 'create_note',
  description:
    'Create a new wiki note. Use for: capturing a thought, starting a research page, or building a meeting/person/project page from a template. ' +
    'At least one of `title` or `content` is recommended. If `template` is given, it is filled with standard vars (date, time, slug, yesterday_slug, tomorrow_slug, title) plus any custom `variables`. ' +
    'Existing slugs cause an error — use append_to_page or update_note_section to extend.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      slug: { type: 'string', description: 'Override auto-derived slug (must match [a-z0-9][a-z0-9_-]*)' },
      kind: { type: 'string', description: "default 'note'. Known: note, daily, meeting, person, project, concept, or custom" },
      template: { type: 'string', description: 'Template name (without .md) from ~/mindbase-data/templates/' },
      content: { type: 'string', description: 'Raw markdown body. Mutually exclusive with template.' },
      tags: { type: 'array', items: { type: 'string' } },
      project: { type: 'string' },
      variables: { type: 'object', additionalProperties: { type: 'string' } },
    },
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const p = parsed.data;

  if (p.content && p.template) {
    return errorResult('Pass either `content` or `template`, not both.');
  }
  if (!p.title && !p.content && !p.slug) {
    return errorResult('Provide at least one of: title, content, or slug.');
  }

  try {
    const result = await createNote(ctx.store, ctx.templates, {
      title: p.title,
      slug: p.slug,
      kind: p.kind ?? 'note',
      template: p.template,
      content: p.content,
      tags: p.tags,
      project: p.project,
      variables: p.variables,
      createdVia: 'mcp',
      mcpClient: ctx.mcpClient,
      mcpTool: 'create_note',
    });
    await ctx.reindex();
    return textResult({
      slug: result.slug,
      path: result.path,
      kind: result.meta.kind,
      title: result.meta.title,
      created: true,
    });
  } catch (e) {
    if (e instanceof SlugConflictError) {
      return errorResult(
        `Slug already exists: '${e.existingSlug}'`,
        'Choose a different title or pass a unique `slug`. Use append_to_page to extend the existing page.',
      );
    }
    return errorResult(`create_note failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
