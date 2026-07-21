// apps/mcp/src/tools/status.ts
import { z } from 'zod';
import { join } from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { resolveProjectId } from '../lib/resolve-project.js';
import { projectPaths } from '@mindbase/core';

export const inputSchema = z.object({
  projectId: z.string().optional(),
});

export const definition = {
  name: 'mindbase_status',
  description: 'Project dashboard: last build time, line counts, contributor stats, recent operations, file counts. Read-only.',
  inputSchema: {
    type: 'object',
    properties: { projectId: { type: 'string', description: 'Project id; defaults to the current project (config.json)' } },
      },
};

async function countLines(path: string): Promise<number> {
  try { return (await readFile(path, 'utf-8')).split('\n').length; } catch { return 0; }
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: string[] = [];
  try { entries = await readdir(dir); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e);
    try {
      const s = await stat(full);
      if (s.isDirectory()) out.push(...(await listFiles(full)));
      else out.push(full);
    } catch { /* skip */ }
  }
  return out;
}

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message}`);
  const resolved = await resolveProjectId(ctx, parsed.data.projectId);
  if (!resolved.ok) return errorResult(resolved.error);
  const projectId = resolved.projectId;
  const root = join(ctx.dataDir, 'projects', projectId);
  const p = projectPaths();

  const [readmeLines, contextLines, indexLines] = await Promise.all([
    countLines(join(root, p.readme)),
    countLines(join(root, p.context)),
    countLines(join(root, p.indexYaml)),
  ]);

  let lastBuild = '';
  try { lastBuild = new Date((await stat(join(root, p.context))).mtimeMs).toISOString(); } catch { /* ok */ }

  const contributors = await listFiles(join(root, p.contributorsRoot));
  const research = await listFiles(join(root, p.researchDir));
  const raw = await listFiles(join(root, p.rawDir));
  const logs = await listFiles(join(root, p.logsRoot));
  const artifacts = await listFiles(join(root, p.artifactsRoot));

  const contributorUsers = new Set(contributors.map((f) => f.split('/sources/contributors/')[1]?.split('/')[0] ?? '')).size;

  return textResult({
    projectId,
    projectRoot: root,
    files: {
      readme: { lines: readmeLines },
      context: { lines: contextLines, last_build: lastBuild },
      index: { lines: indexLines },
    },
    contributors: { users: contributorUsers, total_entries: contributors.length },
    sources: { research: research.length, raw: raw.length },
    logs: logs.length,
    artifacts: artifacts.length,
  });
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
