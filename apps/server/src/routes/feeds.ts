import { Router } from 'express';
import multer from 'multer';
import Parser from 'rss-parser';
import type { ServerContext } from '../context';
import type { FeedStore } from '@mindbase/core';
import { parseOpml } from '@mindbase/core';
import type { RSSWorker } from '../lib/rss-worker';

const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });
const probe = new Parser({ timeout: 15000 });

export function feedsRoutes(
  _ctx: ServerContext,
  feeds: FeedStore,
  worker: RSSWorker,
): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ feeds: await feeds.summaries() });
  });

  router.post('/', async (req, res) => {
    const { url, tags, project, intervalMinutes } = req.body as {
      url: string;
      tags?: string[];
      project?: string;
      intervalMinutes?: number;
    };
    if (!url) {
      res.status(400).json({ error: 'url required' });
      return;
    }
    try {
      // Probe to validate + grab feed name
      const parsed = await probe.parseURL(url);
      const feed = await feeds.add({
        url,
        name: parsed.title ?? url,
        site_url: parsed.link,
        tags: tags ?? [],
        project,
        interval_minutes: intervalMinutes,
      });
      res.json({ feed });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.put('/:id', async (req, res) => {
    const id = req.params['id'];
    if (typeof id !== 'string') {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    try {
      const updated = await feeds.update(id, req.body as Parameters<FeedStore['update']>[1]);
      res.json({ feed: updated });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = req.params['id'];
    if (typeof id !== 'string') {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    await feeds.remove(id);
    res.json({ ok: true });
  });

  router.post('/:id/refresh', async (req, res) => {
    const id = req.params['id'];
    if (typeof id !== 'string') {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    try {
      const r = await worker.pollOne(id);
      res.json(r);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/refresh-all', async (_req, res) => {
    try {
      const r = await worker.tick();
      res.json(r);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/import-opml', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'file required' });
      return;
    }
    const xml = req.file.buffer.toString('utf8');
    let parsed: ReturnType<typeof parseOpml>;
    try {
      parsed = parseOpml(xml);
    } catch (e) {
      res.status(400).json({ error: `OPML parse failed: ${(e as Error).message}` });
      return;
    }
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const { title, xmlUrl } of parsed) {
      try {
        await feeds.add({ url: xmlUrl, name: title, tags: [], project: undefined });
        imported++;
      } catch (e) {
        if ((e as Error).message.includes('already')) skipped++;
        else errors.push(`${title}: ${(e as Error).message}`);
      }
    }
    res.json({ imported, skipped, errors });
  });

  return router;
}
