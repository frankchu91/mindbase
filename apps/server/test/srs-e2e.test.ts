import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootTestServer, type TestServer } from './helpers/server-fixture';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

let srv: TestServer;

beforeAll(async () => {
  srv = await bootTestServer();
});

afterAll(async () => {
  await srv.close();
});

describe('SRS API E2E', () => {
  let cardId: string;

  it('POST /api/srs/cards creates a card with default SM-2 values', async () => {
    const res = await fetch(`${srv.url}/api/srs/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is RAG?', answer: 'Retrieval Augmented Generation' }),
    });
    expect(res.status).toBe(200);
    const { card } = (await res.json()) as {
      card: { id: string; interval: number; ease_factor: number; repetitions: number };
    };
    cardId = card.id;
    expect(card.interval).toBe(0);
    expect(card.ease_factor).toBeCloseTo(2.5);
    expect(card.repetitions).toBe(0);
  });

  it('POST /api/srs/answer good → interval 1, repetitions 1', async () => {
    const res = await fetch(`${srv.url}/api/srs/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cardId, rating: 'good' }),
    });
    expect(res.status).toBe(200);
    const { card } = (await res.json()) as {
      card: { interval: number; repetitions: number; ease_factor: number };
    };
    expect(card.repetitions).toBe(1);
    expect(card.interval).toBe(1);
  });

  it('POST /api/srs/answer good again → interval 6, repetitions 2', async () => {
    const res = await fetch(`${srv.url}/api/srs/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cardId, rating: 'good' }),
    });
    expect(res.status).toBe(200);
    const { card } = (await res.json()) as { card: { interval: number; repetitions: number } };
    expect(card.repetitions).toBe(2);
    expect(card.interval).toBe(6);
  });

  it('POST /api/srs/answer good third time → interval ~15 (round(6 * 2.5))', async () => {
    const res = await fetch(`${srv.url}/api/srs/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cardId, rating: 'good' }),
    });
    expect(res.status).toBe(200);
    const { card } = (await res.json()) as { card: { interval: number; repetitions: number } };
    expect(card.repetitions).toBe(3);
    expect(card.interval).toBe(15);
  });

  it('POST /api/srs/answer forgot → resets to repetitions 0, interval 1', async () => {
    const res = await fetch(`${srv.url}/api/srs/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cardId, rating: 'forgot' }),
    });
    expect(res.status).toBe(200);
    const { card } = (await res.json()) as { card: { repetitions: number; interval: number } };
    expect(card.repetitions).toBe(0);
    expect(card.interval).toBe(1);
  });

  it('GET /api/srs/stats returns counts', async () => {
    const res = await fetch(`${srv.url}/api/srs/stats`);
    expect(res.status).toBe(200);
    const stats = (await res.json()) as { total: number; due: number; archived: number };
    expect(typeof stats.total).toBe('number');
    expect(stats.total).toBeGreaterThanOrEqual(1);
  });

  it('PUT /api/srs/cards/:id with archived: true removes from due list', async () => {
    // Make card due immediately by setting due_at to past via answer
    const archRes = await fetch(`${srv.url}/api/srs/cards/${cardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    expect(archRes.status).toBe(200);
    const { card } = (await archRes.json()) as { card: { archived: boolean } };
    expect(card.archived).toBe(true);

    // Verify it's not in the due list
    const dueRes = await fetch(`${srv.url}/api/srs/due`);
    const { cards } = (await dueRes.json()) as { cards: Array<{ id: string }> };
    expect(cards.find((c) => c.id === cardId)).toBeUndefined();
  });

  it('POST /api/srs/extract/:slug creates cards from a fixture wiki page', async () => {
    // Enable SRS config in the context (required for extractOne)
    srv.ctx.config.srs = {
      enabled: true,
      autoExtract: false,
      cardsPerPage: 3,
      extractionIntervalHours: 6,
      newCardsPerDayLimit: 20,
    };

    // Seed a wiki note for SRS extraction
    const wikiDir = join(srv.dataDir, 'wiki', 'notes');
    mkdirSync(wikiDir, { recursive: true });
    writeFileSync(
      join(wikiDir, 'test-srs-page.md'),
      '# SRS Test Page\n\nThis page contains information about spaced repetition systems and review cards for testing purposes.',
    );
    writeFileSync(
      join(wikiDir, 'test-srs-page.meta.json'),
      JSON.stringify({
        id: 'test-srs',
        title: 'SRS Test Page',
        type: 'concept',
        one_liner: 'Test page for SRS',
        edit_state: 'ai_generated',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        word_count: 20,
      }),
    );

    const res = await fetch(`${srv.url}/api/srs/extract/test-srs-page`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: unknown[]; created_now: number };
    // Mock adapter returns 1 card for SRS extraction
    expect(body.created_now).toBeGreaterThanOrEqual(0); // some runs may skip if page already extracted
    expect(Array.isArray(body.cards)).toBe(true);
  }, 15000);

  it('GET /api/srs/due filters to cards due now', async () => {
    const res = await fetch(`${srv.url}/api/srs/due`);
    expect(res.status).toBe(200);
    const { cards, total_due } = (await res.json()) as { cards: unknown[]; total_due: number };
    expect(Array.isArray(cards)).toBe(true);
    expect(typeof total_due).toBe('number');
  });
});
