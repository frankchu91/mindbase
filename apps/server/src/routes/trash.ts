import { Router } from 'express';
import type { ServerContext } from '../context';
import type { FileStore } from '@mindbase/core';

export function trashRoutes(ctx: ServerContext): Router {
  const router = Router();
  const store = ctx.store as unknown as FileStore;

  router.get('/', async (_req, res) => {
    try {
      res.json({ entries: await store.listTrash() });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/restore/:id', async (req, res) => {
    try {
      const result = await store.restoreFromTrash(req.params['id']!);
      await ctx.reindexWiki();
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/permanent-delete/:id', async (req, res) => {
    try {
      await store.permanentlyDelete(req.params['id']!);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/empty', async (_req, res) => {
    try {
      await store.emptyTrash();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
