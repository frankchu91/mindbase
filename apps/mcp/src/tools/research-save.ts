// apps/mcp/src/tools/research-save.ts
import { z } from 'zod';
import { join } from 'node:path';
import { mkdir, appendFile, readFile } from 'node:fs/promises';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { projectPaths, isoToday, slugify } from '@mindbase/core';

export const inputSchema = z.object({
  projectId: z.string().min(1),
  topic: z.string().min(1),
  body: z.string().min(1),
  sources: z.array(z.string()).optional().default([]),
});

export const definition = {
  name: 'mindbase_research_save',
  description: 'Save research findings to sources/research/<slug>.md. Appends if file exists; otherwise creates. Always appends a log entry.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      topic: { type: 'string', description: 'Human-readable topic name; slugified for filename' },
      body: { type: 'string', description: 'Markdown body' },
      sources: { type: 'array', items: { type: 'string' }, description: 'URLs or citations' },
    },
    required: ['projectId', 'topic', 'body'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message}`);
  const { projectId, topic, body, sources } = parsed.data;
  const slug = slugify(topic);
  const root = join(ctx.dataDir, 'projects', projectId);
  const p = projectPaths();
  const filePath = join(root, p.researchFile(slug));
  await mkdir(join(root, p.researchDir), { recursive: true });

  const today = isoToday();
  const hhmm = new Date().toISOString().slice(11, 16);

  let existing = '';
  try { existing = await readFile(filePath, 'utf-8'); } catch { /* new file */ }

  const sourceBlock = sources.length ? `\n\n**Sources**:\n${sources.map((s) => `- ${s}`).join('\n')}\n` : '';
  const entry = existing
    ? `\n\n## Added ${today} ${hhmm}\n\n${body}${sourceBlock}`
    : `# ${topic}\n\n*Started ${today}*\n\n${body}${sourceBlock}`;

  await appendFile(filePath, entry, 'utf-8');

  // Log.
  await mkdir(join(root, p.logsRoot), { recursive: true });
  const logLine = `## [${today} ${hhmm}] research | ${topic} | bytes=${body.length} sources=${sources.length}\n`;
  await appendFile(join(root, p.logsDay(today)), logLine, 'utf-8');

  return textResult({ projectId, file: p.researchFile(slug), bytes: body.length, sources: sources.length });
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
