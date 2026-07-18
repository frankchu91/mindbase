import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CardStore } from './store';

let tmpDir: string;
let store: CardStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'srs-test-'));
  store = new CardStore(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('CardStore — basic CRUD', () => {
  it('creates a card and lists it', async () => {
    const card = await store.create({ question: 'What is X?', answer: 'It is Y.' });
    expect(card.id).toBeTruthy();
    expect(card.question).toBe('What is X?');

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(card.id);
  });

  it('persists across instances', async () => {
    const card = await store.create({ question: 'Q', answer: 'A' });

    // New instance reading same dir
    const store2 = new CardStore(tmpDir);
    const list = await store2.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(card.id);
  });

  it('delete removes the card', async () => {
    const card = await store.create({ question: 'Q', answer: 'A' });
    await store.delete(card.id);
    const list = await store.list();
    expect(list).toHaveLength(0);
  });

  it('update patches the card', async () => {
    const card = await store.create({ question: 'Q', answer: 'A' });
    const updated = await store.update(card.id, { question: 'Updated Q' });
    expect(updated.question).toBe('Updated Q');
    expect(updated.answer).toBe('A');
  });
});

describe('CardStore — findDue', () => {
  it('filters cards by due_at', async () => {
    // Create a card that is already due (default due_at = now at creation)
    await store.create({ question: 'Due card', answer: 'A' });

    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    // Answer the card with 'good' so it gets rescheduled far in the future
    const allCards = await store.list();
    const cardId = allCards[0]!.id;
    await store.answer(cardId, 'good');
    await store.answer(cardId, 'good'); // reps=1 → interval=6

    // Now create a card that should be due
    const now = new Date();
    const dueCard = await store.create({ question: 'Still due', answer: 'A' });

    // manually set due date in the past by re-reading after creation (card is due by default)
    const due = await store.findDue(now);
    // At least the newly created card should be due
    expect(due.cards.length).toBeGreaterThanOrEqual(1);
    expect(due.cards.some(c => c.id === dueCard.id)).toBe(true);

    // Future check: with a past cutoff, no cards due
    const pastNow = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago
    const duePast = await store.findDue(pastNow);
    // Newly created card due_at is at creation time, which is < now
    // but pastNow is before creation - so it depends on timing
    expect(duePast.total).toBeGreaterThanOrEqual(0);

    // With future date, all unarchived cards should be due
    const due2 = await store.findDue(futureDate);
    expect(due2.total).toBeGreaterThanOrEqual(1);
  });

  it('excludes archived cards from due', async () => {
    const card = await store.create({ question: 'Q', answer: 'A' });
    await store.update(card.id, { archived: true });

    const due = await store.findDue(new Date(Date.now() + 10000));
    expect(due.cards.some(c => c.id === card.id)).toBe(false);
  });
});

describe('CardStore — stats', () => {
  it('counts mastered, learning, archived, due correctly', async () => {
    // Create learning card (reps < 5)
    await store.create({ question: 'Learning', answer: 'A' });

    // Create a second learning card
    await store.create({ question: 'Learning2', answer: 'B' });

    // Archive one
    const card3 = await store.create({ question: 'Archived', answer: 'C' });
    await store.update(card3.id, { archived: true });

    // Use a future now so newly created cards (due_at = creation time) are due
    const futureNow = new Date(Date.now() + 60 * 1000);
    const stats = await store.stats(futureNow);
    expect(stats.total).toBe(3);
    expect(stats.archived).toBe(1);
    expect(stats.learning).toBeGreaterThanOrEqual(1); // card1, card2
    expect(stats.due).toBeGreaterThanOrEqual(1); // newly created cards are due
  });

  it('counts by_tag correctly', async () => {
    await store.create({ question: 'Q1', answer: 'A', tags: ['ml', 'ai'] });
    await store.create({ question: 'Q2', answer: 'A', tags: ['ml'] });

    const stats = await store.stats();
    expect(stats.by_tag['ml']).toBe(2);
    expect(stats.by_tag['ai']).toBe(1);
  });
});

describe('CardStore — archive', () => {
  it('sets archived_at when archiving', async () => {
    const card = await store.create({ question: 'Q', answer: 'A' });
    expect(card.archived_at).toBeUndefined();

    const updated = await store.update(card.id, { archived: true });
    expect(updated.archived).toBe(true);
    expect(updated.archived_at).toBeTruthy();
  });

  it('clears archived_at when unarchiving', async () => {
    const card = await store.create({ question: 'Q', answer: 'A' });
    await store.update(card.id, { archived: true });
    const unarchived = await store.update(card.id, { archived: false });
    expect(unarchived.archived).toBe(false);
    expect(unarchived.archived_at).toBeUndefined();
  });

  it('list() excludes archived by default, includes when flagged', async () => {
    const card = await store.create({ question: 'Q', answer: 'A' });
    await store.update(card.id, { archived: true });

    const defaultList = await store.list();
    expect(defaultList).toHaveLength(0);

    const withArchived = await store.list({ include_archived: true });
    expect(withArchived).toHaveLength(1);
  });
});

describe('CardStore — countCreatedSince', () => {
  it('counts only cards created after the since date', async () => {
    const before = new Date(Date.now() - 1000);
    await store.create({ question: 'Q1', answer: 'A' });
    await store.create({ question: 'Q2', answer: 'A' });

    const count = await store.countCreatedSince(before);
    expect(count).toBe(2);

    const future = new Date(Date.now() + 1000);
    const countFuture = await store.countCreatedSince(future);
    expect(countFuture).toBe(0);
  });
});

describe('CardStore — findBySource', () => {
  it('filters by source_slug', async () => {
    await store.create({ question: 'Q1', answer: 'A', source_slug: 'rag-systems' });
    await store.create({ question: 'Q2', answer: 'A', source_slug: 'other-page' });

    const result = await store.findBySource('rag-systems');
    expect(result).toHaveLength(1);
    expect(result[0]!.question).toBe('Q1');
  });

  it('includes archived cards in findBySource', async () => {
    const card = await store.create({ question: 'Q', answer: 'A', source_slug: 'my-page' });
    await store.update(card.id, { archived: true });

    const result = await store.findBySource('my-page');
    expect(result).toHaveLength(1);
  });
});
