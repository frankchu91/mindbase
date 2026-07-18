// apps/mcp/src/tools/gather-sources.ts
import { z } from 'zod';
import { join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { projectPaths } from '@mindbase/core';

export const inputSchema = z.object({
  projectId: z.string().min(1),
  since: z.string().optional(),
});

export const definition = {
  name: 'mindbase_gather_sources',
  description: 'List contributor + research files modified since the last build (or since a given ISO date). Returns paths + sizes + mtimes. Used by /mb:build to know what to synthesize.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      since: { type: 'string', description: 'ISO date (YYYY-MM-DD); defaults to last context.md mtime' },
    },
    required: ['projectId'],
  },
};

async function lastBuildTime(root: string, contextPath: string): Promise<number> {
  try { return (await stat(join(root, contextPath))).mtimeMs; } catch { return 0; }
}

async function listMd(dir: string): Promise<{ path: string; size: number; mtimeMs: number }[]> {
  const out: { path: string; size: number; mtimeMs: number }[] = [];
  let entries: string[] = [];
  try { entries = await readdir(dir); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e);
    try {
      const s = await stat(full);
      if (s.isDirectory()) {
        const sub = await listMd(full);
        out.push(...sub);
      } else if (e.endsWith('.md')) {
        out.push({ path: full, size: s.size, mtimeMs: s.mtimeMs });
      }
    } catch { /* skip */ }
  }
  return out;
}

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message}`);
  const { projectId, since } = parsed.data;
  const root = join(ctx.dataDir, 'projects', projectId);
  const p = projectPaths();

  const cutoff = since ? new Date(since).getTime() : await lastBuildTime(root, p.context);
  const contributors = await listMd(join(root, p.contributorsRoot));
  const research = await listMd(join(root, p.researchDir));
  const all = [...contributors, ...research];
  const unbuilt = all.filter((f) => f.mtimeMs > cutoff).map((f) => ({
    path: f.path.slice(root.length + 1),
    size: f.size,
    mtime: new Date(f.mtimeMs).toISOString(),
  }));

  return textResult({ projectId, since: new Date(cutoff).toISOString(), unbuilt });
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
