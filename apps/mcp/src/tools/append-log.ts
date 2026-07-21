// apps/mcp/src/tools/append-log.ts
import { z } from 'zod';
import { join } from 'node:path';
import { mkdir, appendFile } from 'node:fs/promises';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { resolveProjectId } from '../lib/resolve-project.js';
import { projectPaths, isoToday } from '@mindbase/core';

export const inputSchema = z.object({
  projectId: z.string().optional(),
  operation: z.string().min(1),
  topic: z.string().min(1),
  details: z.string().optional().default(''),
});

export const definition = {
  name: 'mindbase_append_log',
  description: 'Append a structured entry to logs/<today>.md. Format: ## [YYYY-MM-DD HH:MM] {operation} | {topic} | {details}',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project id; defaults to the current project (config.json)' },
      operation: { type: 'string', description: 'ingest | build | lint | research | migrate | export | ...' },
      topic: { type: 'string' },
      details: { type: 'string', description: 'Optional details (e.g., "created 4, updated 3")' },
    },
    required: ['operation', 'topic'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message}`);
  const { operation, topic, details } = parsed.data;
  const resolved = await resolveProjectId(ctx, parsed.data.projectId);
  if (!resolved.ok) return errorResult(resolved.error);
  const projectId = resolved.projectId;

  const today = isoToday();
  const hhmm = new Date().toISOString().slice(11, 16);
  const root = join(ctx.dataDir, 'projects', projectId);
  const p = projectPaths();
  await mkdir(join(root, p.logsRoot), { recursive: true });

  const line = `## [${today} ${hhmm}] ${operation} | ${topic}${details ? ` | ${details}` : ''}\n`;
  await appendFile(join(root, p.logsDay(today)), line, 'utf-8');

  return textResult({ projectId, file: p.logsDay(today), line: line.trim() });
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
