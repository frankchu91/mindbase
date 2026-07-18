import { classifyNote, type MetaJson } from '@mindbase/core';
import type { ServerContext } from '../context';

/**
 * Fire-and-forget classification trigger. Reads the note's current meta,
 * skips if folder_set_by === 'user' (manual lock), otherwise calls the LLM
 * and writes the result. NEVER blocks or throws to the caller — errors are
 * logged and the note is marked as inbox-with-failure-reason.
 *
 * Pass force=true from a user-initiated "Reclassify" button to bypass the
 * user lock.
 */
export function classifyNoteAsync(ctx: ServerContext, slug: string, opts?: { force?: boolean }): void {
  void (async () => {
    try {
      const metaPath = `wiki/notes/${slug}.meta.json`;
      let meta: MetaJson;
      try {
        meta = await ctx.store.readJSON<MetaJson>(metaPath);
      } catch {
        console.warn(`[classify-worker] note not found: ${slug}`);
        return;
      }
      if (!opts?.force && meta.folder_set_by === 'user') {
        // Respect user lock
        console.log(`[classify-worker] ${slug}: skipped (user-locked to ${meta.folder ?? 'inbox'})`);
        return;
      }
      const adapter = ctx.getAdapter();
      const t0 = Date.now();
      console.log(`[classify-worker] ${slug}: started${opts?.force ? ' (force)' : ''}`);
      const result = await classifyNote({
        adapter,
        store: ctx.store,
        slug,
        model: ctx.config.model,
      });
      meta.folder = result.folder;
      meta.folder_set_by = 'llm';
      meta.folder_reason = result.reason;
      meta.folder_classified_at = new Date().toISOString();
      await ctx.store.writeJSON(metaPath, meta);
      console.log(`[classify-worker] ${slug}: → ${result.folder} (${Date.now() - t0}ms) — ${result.reason.slice(0, 100)}`);
    } catch (e) {
      console.error(`[classify-worker] unexpected error for ${slug}:`, e);
    }
  })();
}
