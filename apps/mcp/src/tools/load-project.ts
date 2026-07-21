// apps/mcp/src/tools/load-project.ts
import { z } from 'zod';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { resolveProjectId } from '../lib/resolve-project.js';
import { projectPaths } from '@mindbase/core';

export const inputSchema = z.object({
  projectId: z.string().optional(),
  persist: z.boolean().optional().default(false),
});

export const definition = {
  name: 'mindbase_load_project',
  description: 'Load the README + context + index.yaml for a project (defaults to currentProjectId in config.json). Returns the three file bodies for context injection. Read-only by default; pass persist=true to also update config.json currentProjectId (i.e. switch the active project).',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project id; if omitted, resolves to config.json currentProjectId' },
      persist: { type: 'boolean', description: 'If true, write projectId to config.json as currentProjectId. Default false (read-only). Use true only when the caller intends to switch the active project.' },
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
  try {
    const [readme, context, indexYaml] = await Promise.all([
      readFile(join(root, p.readme), 'utf-8'),
      readFile(join(root, p.context), 'utf-8'),
      readFile(join(root, p.indexYaml), 'utf-8'),
    ]);

    // Persist as current project only when caller opts in (default is read-only).
    if (parsed.data.persist) {
      const configPath = join(ctx.dataDir, 'config.json');
      let existingConfig: Record<string, unknown> = {};
      try {
        existingConfig = JSON.parse(await readFile(configPath, 'utf-8')) as Record<string, unknown>;
      } catch { /* not present */ }
      existingConfig['currentProjectId'] = projectId;
      await writeFile(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');
    }

    return textResult({ projectId, projectRoot: root, readme, context, indexYaml, persisted: parsed.data.persist });
  } catch (e) {
    return errorResult(`Failed to load project '${projectId}': ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
