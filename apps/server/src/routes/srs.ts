import { Router } from 'express';
import type { ServerContext } from '../context';
import type { CardStore } from '@mindbase/core';
import type { SRSExtractor } from '../lib/srs-worker';

export function srsRoutes(ctx: ServerContext, cards: CardStore, extractor: SRSExtractor): Router {
  const router = Router();

  router.get('/due', async (_req, res) => {
    const r = await cards.findDue();
    res.json({ cards: r.cards, total_due: r.total });
  });

  router.post('/answer', async (req, res) => {
    const { id, rating } = req.body as { id: string; rating: 'forgot' | 'hard' | 'good' | 'easy' };
    if (!id || !['forgot', 'hard', 'good', 'easy'].includes(rating)) {
      res.status(400).json({ error: 'invalid input' });
      return;
    }
    try {
      const card = await cards.answer(id, rating);
      res.json({ card, next_due: card.due_at });
    } catch (e) {
      res.status(404).json({ error: (e as Error).message });
    }
  });

  router.post('/cards', async (req, res) => {
    const { question, answer, source_slug, source_excerpt, tags } = req.body as {
      question: string;
      answer: string;
      source_slug?: string;
      source_excerpt?: string;
      tags?: string[];
    };
    if (typeof question !== 'string' || typeof answer !== 'string') {
      res.status(400).json({ error: 'question and answer required' });
      return;
    }
    const card = await cards.create({ question, answer, source_slug, source_excerpt, tags, created_via: 'manual' });
    res.json({ card });
  });

  router.put('/cards/:id', async (req, res) => {
    const id = req.params['id'];
    if (typeof id !== 'string') { res.status(400).json({ error: 'invalid id' }); return; }
    try {
      const card = await cards.update(id, req.body as Partial<{ question: string; answer: string; tags: string[]; archived: boolean }>);
      res.json({ card });
    } catch (e) {
      res.status(404).json({ error: (e as Error).message });
    }
  });

  router.delete('/cards/:id', async (req, res) => {
    const id = req.params['id'];
    if (typeof id !== 'string') { res.status(400).json({ error: 'invalid id' }); return; }
    await cards.delete(id);
    res.json({ ok: true });
  });

  router.get('/cards', async (req, res) => {
    const slug = typeof req.query['slug'] === 'string' ? req.query['slug'] : undefined;
    const include_archived = req.query['include_archived'] === 'true';
    const list = slug ? await cards.findBySource(slug) : await cards.list({ include_archived });
    res.json({ cards: list });
  });

  router.post('/extract/:slug', async (req, res) => {
    const slug = req.params['slug'];
    if (typeof slug !== 'string') { res.status(400).json({ error: 'invalid slug' }); return; }
    try {
      const created = await extractor.extractOne(slug);
      const fullCards = await cards.findBySource(slug);
      res.json({ cards: fullCards, created_now: created.length });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/stats', async (_req, res) => {
    res.json(await cards.stats());
  });

  // Suppress unused ctx warning — ctx may be needed for future auth/config checks
  void ctx;

  return router;
}
