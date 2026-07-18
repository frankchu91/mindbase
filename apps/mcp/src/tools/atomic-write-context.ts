// apps/mcp/src/tools/atomic-write-context.ts
import { z } from 'zod';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, rename, appendFile } from 'node:fs/promises';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { projectPaths, isoToday } from '@mindbase/core';

export const inputSchema = z.object({
  projectId: z.string().min(1),
  content: z.string().min(1),
});

export const definition = {
  name: 'mindbase_atomic_write_context',
  description: 'Write new content into context.md atomically. Steps: (1) snapshot current context.md → state/builder/snapshots/<timestamp>.md, (2) tmpwrite + rename, (3) append log entry. Enforces 400-line cap by truncating overflow to sources/research/<auto>.md.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      content: { type: 'string', description: 'New context.md body (full file replacement)' },
    },
    required: ['projectId', 'content'],
  },
};

const MAX_LINES = 400;

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message}`);
  const { projectId, content } = parsed.data;
  const today = isoToday();
  const hhmm = new Date().toISOString().slice(11, 16);
  const stamp = `${today}T${hhmm.replace(':', '')}`;
  const root = join(ctx.dataDir, 'projects', projectId);
  const p = projectPaths();

  // 1. Snapshot.
  const snapshotDir = join(root, p.stateDir('builder'), 'snapshots');
  await mkdir(snapshotDir, { recursive: true });
  try {
    const prior = await readFile(join(root, p.context), 'utf-8');
    await writeFile(join(snapshotDir, `${stamp}.md`), prior, 'utf-8');
  } catch { /* no prior context; first build */ }

  // 2. Line-cap + overflow.
  const lines = content.split('\n');
  let finalBody = content;
  let overflowFile: string | null = null;
  if (lines.length > MAX_LINES) {
    const head = lines.slice(0, MAX_LINES - 5);
    const overflow = lines.slice(MAX_LINES - 5);
    overflowFile = p.researchFile(`context-overflow-${stamp}`);
    await mkdir(join(root, p.researchDir), { recursive: true });
    await writeFile(join(root, overflowFile), `# Overflow from context.md @ ${stamp}\n\n${overflow.join('\n')}`, 'utf-8');
    finalBody = head.join('\n') + `\n\n*[overflow → ${overflowFile}]*\n`;
  }

  // 3. tmpwrite + rename.
  const tmp = join(root, `${p.context}.tmp.${stamp}`);
  await writeFile(tmp, finalBody, 'utf-8');
  await rename(tmp, join(root, p.context));

  // 4. Log.
  await mkdir(join(root, p.logsRoot), { recursive: true });
  const logLine = `## [${today} ${hhmm}] build | atomic_write_context | lines=${lines.length}${overflowFile ? ` overflow=${overflowFile}` : ''}\n`;
  await appendFile(join(root, p.logsDay(today)), logLine, 'utf-8');

  return textResult({
    projectId,
    snapshot: join(p.stateDir('builder'), 'snapshots', `${stamp}.md`),
    overflow: overflowFile,
    lines: lines.length,
  });
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
