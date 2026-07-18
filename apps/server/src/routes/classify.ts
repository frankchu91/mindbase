import { Router } from 'express';
import {
  classifyNote, classifyContent, loadFolders, loadClassifyRules, saveClassifyRules,
  RulesTooLongError, paths as pkgPaths,
  type MetaJson, type RawMetaJson,
} from '@mindbase/core';
import type { ServerContext } from '../context';
import { isValidSlug } from '../safe-path';

// In-memory job registry. Single-user, single-process — fine to keep in RAM.
interface BulkJob {
  total: number;
  done: number;
  errors: number;
  slugs: string[];
  status: 'running' | 'done' | 'cancelled';
}
const bulkJobs = new Map<string, BulkJob>();
let nextJobId = 1;

export function classifyRoutes(ctx: ServerContext): Router {
  const router = Router();

  // POST /api/classify/note/:slug — run classifier synchronously, persist, return result.
  // Used by the "Reclassify this note" button. Ignores user-lock (force).
  router.post('/note/:slug', async (req, res) => {
    try {
      const slug = (req.params as Record<string, string>)['slug']!;
      if (!isValidSlug(slug)) { res.status(400).json({ error: 'invalid slug' }); return; }
      const metaPath = `wiki/notes/${slug}.meta.json`;
      let meta: MetaJson;
      try {
        meta = await ctx.store.readJSON<MetaJson>(metaPath);
      } catch {
        res.status(404).json({ error: 'note not found' });
        return;
      }
      const result = await classifyNote({
        adapter: ctx.getAdapter(),
        store: ctx.store,
        slug,
        model: ctx.config.model,
      });
      meta.folder = result.folder;
      meta.folder_set_by = 'llm';
      meta.folder_reason = result.reason;
      meta.folder_classified_at = new Date().toISOString();
      await ctx.store.writeJSON(metaPath, meta);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/classify/raw/:rawId — run classifier on a raw import (PDF / web-clip / etc.).
  // Reads the extracted-text body, runs the LLM, persists the result on the raw meta.
  router.post('/raw/:rawId', async (req, res) => {
    try {
      const rawId = (req.params as Record<string, string>)['rawId']!;
      if (!isValidSlug(rawId)) { res.status(400).json({ error: 'invalid rawId' }); return; }
      const rawDoc = await ctx.findRawDoc(rawId);
      if (!rawDoc) {
        res.status(404).json({ error: 'raw not found' });
        return;
      }
      // The raw meta lives next to the .md file. findRawDoc returns the path —
      // derive the meta path by swapping the extension.
      // findRawDoc returns path without .md; build the sidecar path explicitly.
      const metaPath = rawDoc.path.endsWith('.md')
        ? rawDoc.path.replace(/\.md$/, '.meta.json')
        : `${rawDoc.path}.meta.json`;
      let meta: RawMetaJson;
      try {
        meta = await ctx.store.readJSON<RawMetaJson>(metaPath);
      } catch {
        res.status(500).json({ error: `raw meta not found at ${metaPath}` });
        return;
      }
      const result = await classifyContent({
        adapter: ctx.getAdapter(),
        store: ctx.store,
        model: ctx.config.model,
        title: rawDoc.title,
        body: rawDoc.content,
      });
      meta.folder = result.folder;
      meta.folder_set_by = 'llm';
      meta.folder_reason = result.reason;
      meta.folder_classified_at = new Date().toISOString();
      await ctx.store.writeJSON(metaPath, meta);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // PUT /api/classify/raw/:rawId/folder — user manually sets the folder on a raw import.
  router.put('/raw/:rawId/folder', async (req, res) => {
    try {
      const rawId = (req.params as Record<string, string>)['rawId']!;
      if (!isValidSlug(rawId)) { res.status(400).json({ error: 'invalid rawId' }); return; }
      const { folder } = req.body as { folder: string | null };
      const rawDoc = await ctx.findRawDoc(rawId);
      if (!rawDoc) {
        res.status(404).json({ error: 'raw not found' });
        return;
      }
      // findRawDoc returns path without .md; build the sidecar path explicitly.
      const metaPath = rawDoc.path.endsWith('.md')
        ? rawDoc.path.replace(/\.md$/, '.meta.json')
        : `${rawDoc.path}.meta.json`;
      let meta: RawMetaJson;
      try {
        meta = await ctx.store.readJSON<RawMetaJson>(metaPath);
      } catch {
        res.status(500).json({ error: `raw meta not found at ${metaPath}` });
        return;
      }
      if (folder !== null) {
        const folders = await loadFolders(ctx.store);
        if (!folders.some((f) => f.path === folder)) {
          res.status(400).json({ error: `unknown folder: ${folder}` });
          return;
        }
      }
      meta.folder = folder;
      meta.folder_set_by = 'user';
      meta.folder_classified_at = new Date().toISOString();
      await ctx.store.writeJSON(metaPath, meta);
      res.json({ ok: true, folder });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // PUT /api/classify/notes/:slug/folder — user manually sets the folder.
  // Writes folder_set_by='user' so future auto-classify skips this note.
  router.put('/notes/:slug/folder', async (req, res) => {
    try {
      const slug = (req.params as Record<string, string>)['slug']!;
      if (!isValidSlug(slug)) { res.status(400).json({ error: 'invalid slug' }); return; }
      const { folder } = req.body as { folder: string | null };
      const metaPath = `wiki/notes/${slug}.meta.json`;
      let meta: MetaJson;
      try {
        meta = await ctx.store.readJSON<MetaJson>(metaPath);
      } catch {
        res.status(404).json({ error: 'note not found' });
        return;
      }
      if (folder !== null) {
        const folders = await loadFolders(ctx.store);
        if (!folders.some((f) => f.path === folder)) {
          res.status(400).json({ error: `unknown folder: ${folder}` });
          return;
        }
      }
      meta.folder = folder;
      meta.folder_set_by = 'user';
      meta.folder_classified_at = new Date().toISOString();
      meta.folder_reason = 'set by user';
      await ctx.store.writeJSON(metaPath, meta);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/classify/rules — return current classify-rules.md content
  router.get('/rules', async (_req, res) => {
    const content = await loadClassifyRules(ctx.store);
    res.json({ content });
  });

  // PUT /api/classify/rules — replace classify-rules.md content
  router.put('/rules', async (req, res) => {
    try {
      const { content } = req.body as { content: string };
      if (typeof content !== 'string') { res.status(400).json({ error: 'content must be string' }); return; }
      await saveClassifyRules(ctx.store, content);
      res.json({ ok: true });
    } catch (e) {
      if (e instanceof RulesTooLongError) {
        res.status(400).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/classify/test — dry-run classify against a slug with optional override rules
  // Body: { slug: string, overrideRules?: string }
  // Does NOT persist. Used by the "Test on a note" picker in the Rules editor.
  router.post('/test', async (req, res) => {
    try {
      const { slug, overrideRules } = req.body as { slug: string; overrideRules?: string };
      if (!slug || !isValidSlug(slug)) { res.status(400).json({ error: 'invalid slug' }); return; }
      // If overrideRules provided, temporarily swap it in
      const savedRules = await loadClassifyRules(ctx.store);
      if (typeof overrideRules === 'string') {
        await saveClassifyRules(ctx.store, overrideRules);
      }
      try {
        const result = await classifyNote({
          adapter: ctx.getAdapter(),
          store: ctx.store,
          slug,
          model: ctx.config.model,
        });
        res.json({ ok: true, ...result });
      } finally {
        // Restore original rules
        if (typeof overrideRules === 'string') {
          await saveClassifyRules(ctx.store, savedRules);
        }
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/classify/bulk — kick off async bulk classify; returns jobId
  router.post('/bulk', async (req, res) => {
    try {
      const { scope } = req.body as { scope: 'unfiled' | 'all' | string };
      const entries = await pkgPaths.listAllWikiPages(ctx.store);
      const slugs: string[] = [];
      for (const e of entries) {
        if (e.kind !== 'file' || !e.name.endsWith('.meta.json')) continue;
        const slug = e.name.replace(/\.meta\.json$/, '');
        try {
          const meta = await ctx.store.readJSON<MetaJson>(`wiki/${e.layer}/${e.name}`);
          // Never auto-touch user-locked notes during bulk
          if (meta.folder_set_by === 'user') continue;
          if (scope === 'unfiled' && meta.folder != null && meta.folder !== 'inbox') continue;
          if (scope.startsWith('folder:') && meta.folder !== scope.slice('folder:'.length)) continue;
          // scope === 'all' falls through
          slugs.push(slug);
        } catch { /* skip */ }
      }
      const jobId = String(nextJobId++);
      bulkJobs.set(jobId, { total: slugs.length, done: 0, errors: 0, slugs, status: 'running' });
      // Fire the job (no await — SSE clients read progress)
      void runBulkJob(ctx, jobId);
      res.json({ ok: true, jobId, total: slugs.length });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/classify/jobs/:jobId/stream — SSE progress
  router.get('/jobs/:jobId/stream', async (req, res) => {
    const job = bulkJobs.get((req.params as Record<string, string>)['jobId']!);
    if (!job) { res.status(404).json({ error: 'job not found' }); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    function send(name: string, data: unknown): void {
      res.write(`event: ${name}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
    // Poll the in-memory job state and emit deltas
    const interval = setInterval(() => {
      send('progress', { done: job.done, total: job.total, errors: job.errors });
      if (job.status !== 'running') {
        send('done', { done: job.done, total: job.total, errors: job.errors });
        clearInterval(interval);
        res.end();
      }
    }, 500);
    req.on('close', () => clearInterval(interval));
  });

  return router;
}

async function runBulkJob(ctx: ServerContext, jobId: string): Promise<void> {
  const job = bulkJobs.get(jobId);
  if (!job) return;
  for (const slug of job.slugs) {
    if (job.status === 'cancelled') break;
    try {
      const metaPath = `wiki/notes/${slug}.meta.json`;
      const meta = await ctx.store.readJSON<MetaJson>(metaPath);
      const result = await classifyNote({
        adapter: ctx.getAdapter(),
        store: ctx.store,
        slug,
        model: ctx.config.model,
      });
      meta.folder = result.folder;
      meta.folder_set_by = 'llm';
      meta.folder_reason = result.reason;
      meta.folder_classified_at = new Date().toISOString();
      await ctx.store.writeJSON(metaPath, meta);
    } catch {
      job.errors++;
    }
    job.done++;
  }
  job.status = 'done';
}
