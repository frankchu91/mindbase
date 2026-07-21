// apps/mcp/src/lib/resolve-project.ts
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import type { Context } from '../context.js';

/**
 * Resolve the target project for a tool call. Precedence: explicit argument →
 * config.json currentProjectId. The zero-state error strings are read by the
 * calling LLM, so they spell out exactly which tool to call next instead of
 * just stating the failure.
 */
export async function resolveProjectId(
  ctx: Context,
  requested?: string,
): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  if (requested) return { ok: true, projectId: requested };

  try {
    const cfg = JSON.parse(
      await readFile(join(ctx.dataDir, 'config.json'), 'utf-8'),
    ) as { currentProjectId?: string };
    if (cfg.currentProjectId) return { ok: true, projectId: cfg.currentProjectId };
  } catch { /* no config yet */ }

  let available: string[] = [];
  try {
    available = (await readdir(join(ctx.dataDir, 'projects'), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch { /* no projects dir */ }

  if (available.length === 0) {
    return {
      ok: false,
      error:
        "No project exists yet. Create one now: call mindbase_init_project({ name: '<short-kebab-name based on what the user is working on>' }) — it becomes the current project automatically — then retry this call.",
    };
  }
  return {
    ok: false,
    error: `No current project selected. Available projects: ${available.join(', ')}. Either pass projectId to this call, or call mindbase_load_project({ projectId: '<one of them>', persist: true }) to make it current, then retry.`,
  };
}
