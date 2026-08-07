import { Router } from 'express';
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ServerContext } from '../../context.js';
import { projectRoot as makeProjectRoot, detectLayoutVersion } from '../../context.js';
import { resolveTreePath, isPathSafe, isSingleFileCategory, type TreeCategory, TREE_CATEGORIES } from '../../lib/tree-paths.js';
import { resolveUser } from '../../lib/user-attribution.js';

const KNOWN = new Set<string>(TREE_CATEGORIES);

function isKnownCategory(c: string): c is TreeCategory {
  return KNOWN.has(c);
}

function wildcardPath(req: { params: unknown }): string {
  const raw = (req.params as Record<string, unknown>)[0];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.join('/');
  return '';
}

/**
 * For contributors, the URL path may include the user as the first segment
 * (e.g. `haobing/2026-06-09.md`). Split it out so we can pass just the file
 * portion to `resolveTreePath`, which will re-prepend the user directory.
 *
 * Rules:
 *  - `<user>/<file>` → { user: '<user>', relPath: '<file>' }
 *  - `<file>` (no slash) → { user: null, relPath: '<file>' } — user comes from header
 */
function splitContributorPath(relPath: string): { user: string | null; relPath: string } {
  const slash = relPath.indexOf('/');
  if (slash === -1) return { user: null, relPath };
  return { user: relPath.slice(0, slash), relPath: relPath.slice(slash + 1) };
}

export function crudRoutes(ctx: ServerContext): Router {
  const router = Router();

  // NOTE: rename must be registered BEFORE the generic GET/*/PUT/*/DELETE
  // handlers so its more-specific suffix (`/rename`) matches first.
  router.patch('/:category/*/rename', async (req, res) => {
    const category = req.params.category;
    if (!isKnownCategory(category)) return res.status(404).json({ error: 'Unknown category', category });
    const projectId = ctx.currentProjectId;
    const layout = await detectLayoutVersion(makeProjectRoot(ctx.dataDir, projectId));
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED', projectId });
    const rawOld = wildcardPath(req);
    const rawNew = req.body?.newPath as string | undefined;
    if (!rawNew || !isPathSafe(rawOld) || !isPathSafe(rawNew)) return res.status(400).json({ error: 'Invalid path' });
    // Contributors paths arrive as <user>/<rest> — split like GET/PUT do,
    // otherwise the header user gets prepended twice.
    let oldUser = resolveUser(req);
    let newUser = oldUser;
    let relOld = rawOld;
    let relNew = rawNew;
    if (category === 'contributors') {
      const o = splitContributorPath(rawOld);
      const n = splitContributorPath(rawNew);
      if (o.user) { oldUser = o.user; relOld = o.relPath; }
      if (n.user) { newUser = n.user; relNew = n.relPath; }
    }
    const oldAbs = join(ctx.dataDir, 'projects', projectId, resolveTreePath(category, relOld, oldUser));
    const newAbs = join(ctx.dataDir, 'projects', projectId, resolveTreePath(category, relNew, newUser));
    try {
      await mkdir(dirname(newAbs), { recursive: true });
      await rename(oldAbs, newAbs);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      return res.status(code === 'ENOENT' ? 404 : 500).json({ error: (e as Error).message });
    }
    return res.json({ category, oldPath: rawOld, newPath: rawNew });
  });

  router.get('/:category/*', async (req, res) => {
    const category = req.params.category;
    if (!isKnownCategory(category)) return res.status(404).json({ error: 'Unknown category', category });
    const projectId = ctx.currentProjectId;
    const layout = await detectLayoutVersion(makeProjectRoot(ctx.dataDir, projectId));
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED', projectId });
    const raw = wildcardPath(req);
    if (!isPathSafe(raw)) return res.status(400).json({ error: 'Path traversal rejected' });
    const headerUser = resolveUser(req);
    let user = headerUser;
    let relPath = raw;
    if (category === 'contributors') {
      const parts = splitContributorPath(raw);
      if (parts.user) user = parts.user;
      relPath = parts.relPath;
    }
    const disk = resolveTreePath(category, relPath, user);
    try {
      const body = await readFile(join(ctx.dataDir, 'projects', projectId, disk), 'utf-8');
      return res.json({ category, path: raw, body, meta: {} });
    } catch {
      return res.status(404).json({ error: 'Not found', category, path: raw });
    }
  });

  router.put('/:category/*', async (req, res) => {
    const category = req.params.category;
    if (!isKnownCategory(category)) return res.status(404).json({ error: 'Unknown category', category });
    const projectId = ctx.currentProjectId;
    const layout = await detectLayoutVersion(makeProjectRoot(ctx.dataDir, projectId));
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED', projectId });
    const raw = wildcardPath(req);
    if (!isPathSafe(raw)) return res.status(400).json({ error: 'Path traversal rejected' });
    const body = typeof req.body === 'string' ? req.body : (req.body?.body ?? '');
    if (typeof body !== 'string') return res.status(400).json({ error: 'Body required' });
    const headerUser = resolveUser(req);
    let user = headerUser;
    let relPath = raw;
    if (category === 'contributors') {
      const parts = splitContributorPath(raw);
      if (parts.user) user = parts.user;
      relPath = parts.relPath;
    }
    const disk = resolveTreePath(category, isSingleFileCategory(category) ? '' : relPath, user);
    const abs = join(ctx.dataDir, 'projects', projectId, disk);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body, 'utf-8');
    return res.json({ category, path: raw, wroteBytes: body.length });
  });

  router.delete('/:category/*', async (req, res) => {
    const category = req.params.category;
    if (!isKnownCategory(category)) return res.status(404).json({ error: 'Unknown category', category });
    const projectId = ctx.currentProjectId;
    const layout = await detectLayoutVersion(makeProjectRoot(ctx.dataDir, projectId));
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED', projectId });
    const raw = wildcardPath(req);
    if (!isPathSafe(raw)) return res.status(400).json({ error: 'Path traversal rejected' });
    const headerUser = resolveUser(req);
    let user = headerUser;
    let relPath = raw;
    if (category === 'contributors') {
      const parts = splitContributorPath(raw);
      if (parts.user) user = parts.user;
      relPath = parts.relPath;
    }
    const disk = resolveTreePath(category, relPath, user);
    const abs = join(ctx.dataDir, 'projects', projectId, disk);
    try { await unlink(abs); return res.status(204).end(); } catch { return res.status(404).json({ error: 'Not found' }); }
  });

  return router;
}
