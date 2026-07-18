// apps/mcp/src/tools/apply-template.ts
import { z } from 'zod';
import { join, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { projectPaths } from '@mindbase/core';

export const inputSchema = z.object({
  projectId: z.string().min(1),
  templateId: z.enum(['empty', 'investigation', 'literature-review', 'market-research', 'reading-companion', 'topic-tracker']),
});

export const definition = {
  name: 'mindbase_apply_template',
  description: 'Overlay a schema template onto an existing project. Appends template prose to README.md and seeds template-specific sections in context.md. Idempotent — re-running with same template is a no-op marker.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      templateId: { type: 'string' },
    },
    required: ['projectId', 'templateId'],
  },
};

function templatePath(): string {
  const fromEnv = process.env['MINDBASE_PLUGIN_ROOT'];
  if (fromEnv) return join(fromEnv, 'templates', 'schema-templates');
  return resolve(process.cwd(), 'apps', 'plugin', 'templates', 'schema-templates');
}

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message}`);
  const { projectId, templateId } = parsed.data;
  if (templateId === 'empty') return textResult({ projectId, templateId, noop: true });

  const root = join(ctx.dataDir, 'projects', projectId);
  const p = projectPaths();
  const tplFile = join(templatePath(), `${templateId}.md.template`);

  let tplBody = '';
  try { tplBody = await readFile(tplFile, 'utf-8'); }
  catch (e) { return errorResult(`Template not found: ${tplFile} (${(e as Error).message})`); }

  const readme = await readFile(join(root, p.readme), 'utf-8').catch(() => '');
  if (readme.includes(`<!-- TEMPLATE: ${templateId} -->`)) {
    return textResult({ projectId, templateId, alreadyApplied: true });
  }
  const newReadme = readme + `\n\n<!-- TEMPLATE: ${templateId} -->\n\n${tplBody}\n`;
  await writeFile(join(root, p.readme), newReadme, 'utf-8');

  return textResult({ projectId, templateId, applied: true });
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
