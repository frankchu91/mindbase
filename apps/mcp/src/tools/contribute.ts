// apps/mcp/src/tools/contribute.ts
import { z } from 'zod';
import { join } from 'node:path';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { projectPaths, isoToday } from '@mindbase/core';

export const inputSchema = z.object({
  text: z.string().min(1),
  projectId: z.string().optional(),
  user: z.string().optional(),
  mode: z.enum(['auto', 'daily', 'concept', 'daily+concept']).optional().default('auto'),
});

export const definition = {
  name: 'mindbase_contribute',
  description: 'Append a contributor entry to the current project. Writes to sources/contributors/<user>/<YYYY-MM-DD>.md (append-only) plus log entry. Route mode forces routing: auto (LLM decides), daily (only contributor file), concept (also flag for /mb:build to extract concept), daily+concept (both).',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Body text to contribute' },
      projectId: { type: 'string', description: 'Project id; if omitted, resolves via config.json' },
      user: { type: 'string', description: 'Contributor username; if omitted, resolves to os.userInfo().username' },
      mode: { type: 'string', description: 'auto | daily | concept | daily+concept' },
    },
    required: ['text'],
  },
};

async function resolveProjectId(ctx: Context, requested?: string): Promise<string | null> {
  if (requested) return requested;
  try {
    const cfg = JSON.parse(await readFile(join(ctx.dataDir, 'config.json'), 'utf-8')) as { currentProjectId?: string };
    return cfg.currentProjectId ?? null;
  } catch { return null; }
}

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message}`);
  const { text, mode } = parsed.data;

  const projectId = await resolveProjectId(ctx, parsed.data.projectId);
  if (!projectId) return errorResult('No current project. Set one via mindbase_load_project or pass projectId.');

  const user = parsed.data.user ?? userInfo().username;
  const today = isoToday();
  const root = join(ctx.dataDir, 'projects', projectId);
  const p = projectPaths();
  const contributorDir = join(root, p.contributorDir(user));
  const contributorFile = join(root, p.contributorDay(user, today));

  await mkdir(contributorDir, { recursive: true });

  const now = new Date().toISOString().slice(11, 16); // HH:MM UTC
  const tagBlock = mode === 'auto' ? '' : ` [mode:${mode}]`;
  const entry = `\n## ${now}${tagBlock}\n\n${text.trim()}\n`;

  // Append-only; if file doesn't exist, create with date header.
  let header = '';
  try { await readFile(contributorFile, 'utf-8'); } catch { header = `# ${today} — ${user}\n`; }
  await appendFile(contributorFile, header + entry, 'utf-8');

  // Append to today's log.
  await mkdir(join(root, p.logsRoot), { recursive: true });
  const logEntry = `## [${today} ${now}] contribute | user=${user} mode=${mode} bytes=${text.length}\n`;
  await appendFile(join(root, p.logsDay(today)), logEntry, 'utf-8');

  return textResult({
    projectId,
    contributorFile: p.contributorDay(user, today),
    logEntry: p.logsDay(today),
    mode,
  });
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
