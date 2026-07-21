// apps/mcp/src/tools/validate-structure.ts
import { z } from 'zod';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { resolveProjectId } from '../lib/resolve-project.js';
import { projectPaths } from '@mindbase/core';

export const inputSchema = z.object({
  projectId: z.string().optional(),
});

export const definition = {
  name: 'mindbase_validate_structure',
  description: 'Validate that a project conforms to the v2 layout. Returns list of missing required files/dirs. Used as a precondition guard by /mb:build and /mb:migrate.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project id; defaults to the current project (config.json)' },
    },
      },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message}`);
  const resolved = await resolveProjectId(ctx, parsed.data.projectId);
  if (!resolved.ok) return errorResult(resolved.error);
  const projectId = resolved.projectId;
  const root = join(ctx.dataDir, 'projects', projectId);
  const p = projectPaths();

  const requiredFiles = [p.readme, p.context, p.indexYaml];
  const requiredDirs = [p.contributorsRoot, p.researchDir, p.logsRoot];

  const missing: string[] = [];
  for (const f of requiredFiles) {
    try { const s = await stat(join(root, f)); if (!s.isFile()) missing.push(`not-a-file: ${f}`); }
    catch { missing.push(`missing-file: ${f}`); }
  }
  for (const d of requiredDirs) {
    try { const s = await stat(join(root, d)); if (!s.isDirectory()) missing.push(`not-a-dir: ${d}`); }
    catch { missing.push(`missing-dir: ${d}`); }
  }

  return textResult({ projectId, valid: missing.length === 0, missing });
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
