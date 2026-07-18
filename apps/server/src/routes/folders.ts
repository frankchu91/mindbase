import { Router } from 'express';
import {
  loadFolders, saveFolders, isValidFolderPath, INBOX_PATH,
  paths as pkgPaths,
  type Folder, type MetaJson,
} from '@mindbase/core';
import type { ServerContext } from '../context';

export function foldersRoutes(ctx: ServerContext): Router {
  const router = Router();

  // GET /api/folders — return the full folder list
  router.get('/', async (_req, res) => {
    const folders = await loadFolders(ctx.store);
    res.json({ folders });
  });

  // POST /api/folders — create a new folder
  router.post('/', async (req, res) => {
    try {
      const { path, name, parent, order } = req.body as { path?: string; name?: string; parent?: string | null; order?: string };
      if (!path || !name || !isValidFolderPath(path)) {
        res.status(400).json({ error: 'invalid path or name' });
        return;
      }
      const existing = await loadFolders(ctx.store);
      if (existing.some((f) => f.path === path)) {
        res.status(400).json({ error: `folder already exists: ${path}` });
        return;
      }
      // Parent must exist (top-level folders are always allowed)
      if (path.includes('/')) {
        const pathParent = path.slice(0, path.lastIndexOf('/'));
        if (!existing.some((f) => f.path === pathParent)) {
          res.status(400).json({ error: `parent folder does not exist: ${pathParent}` });
          return;
        }
      }
      const folder: Folder = {
        path,
        name,
        created_at: new Date().toISOString(),
        parent: parent ?? null,
        order: order ?? 'a0',
      };
      existing.push(folder);
      await saveFolders(ctx.store, existing);
      res.json({ ok: true, folder });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // PATCH /api/folders/:path — update name, parent, order (path is immutable)
  router.patch('/:path(*)', async (req, res) => {
    try {
      const path = (req.params as Record<string, string>)['path']!;
      const { name, parent, order } = req.body as { name?: string; parent?: string | null; order?: string };
      if (name === undefined && parent === undefined && order === undefined) {
        res.status(400).json({ error: 'at least one of name, parent, or order required' });
        return;
      }
      const existing = await loadFolders(ctx.store);
      const idx = existing.findIndex((f) => f.path === path);
      if (idx < 0) { res.status(404).json({ error: 'not found' }); return; }
      if (name !== undefined) existing[idx]!.name = name;
      if (parent !== undefined) existing[idx]!.parent = parent;
      if (order !== undefined) existing[idx]!.order = order;
      await saveFolders(ctx.store, existing);
      res.json({ ok: true, folder: existing[idx] });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // DELETE /api/folders/:path — delete; reparent notes; reject if has subfolders
  router.delete('/:path(*)', async (req, res) => {
    try {
      const path = (req.params as Record<string, string>)['path']!;
      if (path === INBOX_PATH) {
        res.status(400).json({ error: 'cannot delete inbox' });
        return;
      }
      const existing = await loadFolders(ctx.store);
      if (!existing.some((f) => f.path === path)) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const hasSubfolders = existing.some((f) => f.path.startsWith(path + '/'));
      if (hasSubfolders) {
        res.status(400).json({ error: 'delete subfolders first' });
        return;
      }
      // Reparent notes: move to parent path (or inbox if top-level)
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : INBOX_PATH;
      const notes = await pkgPaths.listAllWikiPages(ctx.store);
      for (const entry of notes) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.meta.json')) continue;
        try {
          const metaPath = `wiki/${entry.layer}/${entry.name}`;
          const meta = await ctx.store.readJSON<MetaJson>(metaPath);
          if (meta.folder === path) {
            meta.folder = parent;
            await ctx.store.writeJSON(metaPath, meta);
          }
        } catch { /* skip malformed meta */ }
      }
      const next = existing.filter((f) => f.path !== path);
      await saveFolders(ctx.store, next);
      res.json({ ok: true, reparentedTo: parent });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
