import { Router, type Request, type Response } from 'express';
import type { Inbox } from '../lib/inbox';
import type { CaptureWorker } from '../lib/capture-worker';

export function inboxRoutes(inbox: Inbox, worker: CaptureWorker): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({ entries: await inbox.list() });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/:id/compile', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'];
      if (!id || typeof id !== 'string') {
        res.status(400).json({ error: 'invalid id' });
        return;
      }
      await worker.processOne(id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'];
      if (!id || typeof id !== 'string') {
        res.status(400).json({ error: 'invalid id' });
        return;
      }
      await inbox.delete(id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
