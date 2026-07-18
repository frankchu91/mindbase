// apps/mcp/src/tools/migrate.ts
import { z } from 'zod';
import { userInfo } from 'node:os';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { migrateProject } from '@mindbase/core';

export const inputSchema = z.object({
  projectId: z.string().optional(),
  all: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
  user: z.string().optional(),
});

export const definition = {
  name: 'mindbase_migrate',
  description: 'Migrate one or all projects from legacy wiki/ layout to v2 layout. Snapshots to archive/<projectId>-<unixTs>/ first; idempotent on re-run.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Specific project to migrate; omit + set all=true to migrate every project' },
      all: { type: 'boolean' },
      dryRun: { type: 'boolean', description: 'If true, report what would happen without writing' },
      user: { type: 'string', description: 'Contributor username for routing legacy notes; defaults to os.userInfo()' },
    },
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message}`);
  const { projectId, all, dryRun } = parsed.data;
  const user = parsed.data.user ?? userInfo().username;
  const unixTs = Math.floor(Date.now() / 1000);

  if (!projectId && !all) return errorResult('Either projectId or all=true must be set.');

  const projectIds: string[] = [];
  if (all) {
    try {
      const list = await readdir(join(ctx.dataDir, 'projects'));
      projectIds.push(...list);
    } catch (e) {
      return errorResult(`Failed to list projects: ${(e as Error).message}`);
    }
  } else if (projectId) {
    projectIds.push(projectId);
  }

  const reports = [];
  for (const id of projectIds) {
    try {
      const report = await migrateProject({ dataDir: ctx.dataDir, projectId: id, user, unixTs, dryRun });
      reports.push(report);
    } catch (e) {
      reports.push({ projectId: id, error: (e as Error).message });
    }
  }

  return textResult({ count: reports.length, reports });
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
