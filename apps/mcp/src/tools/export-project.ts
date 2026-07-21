// apps/mcp/src/tools/export-project.ts
import { z } from 'zod';
import { join } from 'node:path';
import { mkdir, cp } from 'node:fs/promises';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { resolveProjectId } from '../lib/resolve-project.js';

export const inputSchema = z.object({
  projectId: z.string().optional(),
  target: z.enum(['markdown-bundle', 'zip-archive']).optional().default('markdown-bundle'),
});

export const definition = {
  name: 'mindbase_export',
  description: 'Export a project to a portable artifact. markdown-bundle: copies project tree to artifacts/exports/<projectId>-<timestamp>/. zip-archive: same plus zips (uses `zip` if available).',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project id; defaults to the current project (config.json)' },
      target: { type: 'string', description: 'markdown-bundle | zip-archive' },
    },
      },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message}`);
  const { target } = parsed.data;
  const resolved = await resolveProjectId(ctx, parsed.data.projectId);
  if (!resolved.ok) return errorResult(resolved.error);
  const projectId = resolved.projectId;
  const stamp = Math.floor(Date.now() / 1000);
  const src = join(ctx.dataDir, 'projects', projectId);
  const dst = join(ctx.dataDir, 'projects', projectId, 'artifacts', 'exports', `${projectId}-${stamp}`);

  await mkdir(dst, { recursive: true });
  await cp(src, dst, { recursive: true, filter: (p) => !p.includes('/artifacts/exports/') });

  if (target === 'zip-archive') {
    const { spawn } = await import('node:child_process');
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('zip', ['-rq', `${dst}.zip`, dst], { stdio: 'inherit' });
      proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`zip exited ${code}`)));
      proc.on('error', reject);
    }).catch((e) => { throw new Error(`zip failed; markdown-bundle written. (${(e as Error).message})`); });
  }

  return textResult({ projectId, target, path: dst });
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
