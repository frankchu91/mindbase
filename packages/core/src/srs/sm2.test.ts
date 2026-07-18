import { describe, it, expect } from 'vitest';
import { applyRating, newCard } from './sm2';

const NOW = new Date('2026-05-09T10:00:00.000Z');

function makeCard(overrides: Partial<ReturnType<typeof newCard>> = {}) {
  return newCard({ id: 'test-id', question: 'Q?', answer: 'A.', now: NOW, ...overrides });
}

describe('newCard', () => {
  it('creates a card with correct initial state', () => {
    const card = makeCard();
    expect(card.interval).toBe(0);
    expect(card.ease_factor).toBe(2.5);
    expect(card.repetitions).toBe(0);
    expect(card.due_at).toBe(NOW.toISOString());
    expect(card.review_history).toEqual([]);
    expect(card.archived).toBe(false);
    expect(card.created_via).toBe('auto');
  });
});

describe('applyRating — forgot', () => {
  it('resets repetitions to 0 and interval to 1, EF unchanged', () => {
    const card = { ...makeCard(), interval: 10, ease_factor: 2.5, repetitions: 3 };
    const result = applyRating(card, 'forgot', NOW);
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
    expect(result.ease_factor).toBe(2.5); // unchanged
  });

  it('sets due_at to now + 1 day', () => {
    const card = makeCard();
    const result = applyRating(card, 'forgot', NOW);
    const expected = new Date(NOW.getTime() + 1 * 24 * 60 * 60 * 1000);
    expect(result.due_at).toBe(expected.toISOString());
  });
});

describe('applyRating — hard', () => {
  it('multiplies interval by 1.2 and reduces EF by 0.15', () => {
    const card = { ...makeCard(), interval: 10, ease_factor: 2.5, repetitions: 2 };
    const result = applyRating(card, 'hard', NOW);
    expect(result.interval).toBe(Math.round(10 * 1.2));
    expect(result.ease_factor).toBeCloseTo(2.5 - 0.15);
    expect(result.repetitions).toBe(2); // unchanged
  });

  it('clamps EF at 1.3 minimum', () => {
    const card = { ...makeCard(), interval: 5, ease_factor: 1.4, repetitions: 2 };
    const result = applyRating(card, 'hard', NOW);
    expect(result.ease_factor).toBe(1.3); // 1.4 - 0.15 = 1.25, clamped to 1.3
  });

  it('does not go below interval 1', () => {
    const card = { ...makeCard(), interval: 0, ease_factor: 2.5, repetitions: 0 };
    const result = applyRating(card, 'hard', NOW);
    expect(result.interval).toBeGreaterThanOrEqual(1);
  });
});

describe('applyRating — good', () => {
  it('reps=0 → interval=1', () => {
    const card = { ...makeCard(), interval: 0, repetitions: 0 };
    const result = applyRating(card, 'good', NOW);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
  });

  it('reps=1 → interval=6', () => {
    const card = { ...makeCard(), interval: 1, repetitions: 1 };
    const result = applyRating(card, 'good', NOW);
    expect(result.interval).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it('reps=2 → interval=round(interval * EF)', () => {
    const card = { ...makeCard(), interval: 6, ease_factor: 2.5, repetitions: 2 };
    const result = applyRating(card, 'good', NOW);
    expect(result.interval).toBe(Math.round(6 * 2.5));
    expect(result.repetitions).toBe(3);
    expect(result.ease_factor).toBe(2.5); // unchanged
  });
});

describe('applyRating — easy', () => {
  it('reps=0 → interval=4, EF += 0.15', () => {
    const card = { ...makeCard(), interval: 0, ease_factor: 2.5, repetitions: 0 };
    const result = applyRating(card, 'easy', NOW);
    expect(result.interval).toBe(4);
    expect(result.ease_factor).toBeCloseTo(2.65);
    expect(result.repetitions).toBe(1);
  });

  it('reps=1 → interval=7, EF += 0.15', () => {
    const card = { ...makeCard(), interval: 4, ease_factor: 2.5, repetitions: 1 };
    const result = applyRating(card, 'easy', NOW);
    expect(result.interval).toBe(7);
    expect(result.ease_factor).toBeCloseTo(2.65);
    expect(result.repetitions).toBe(2);
  });

  it('reps=2 → interval=round(interval * EF * 1.3), EF += 0.15', () => {
    const card = { ...makeCard(), interval: 7, ease_factor: 2.5, repetitions: 2 };
    const result = applyRating(card, 'easy', NOW);
    expect(result.interval).toBe(Math.round(7 * 2.5 * 1.3));
    expect(result.ease_factor).toBeCloseTo(2.65);
    expect(result.repetitions).toBe(3);
  });
});

describe('due_at calculation', () => {
  it('sets due_at to now + interval days', () => {
    const card = { ...makeCard(), interval: 0, repetitions: 0 };
    const result = applyRating(card, 'good', NOW); // good on reps=0 → interval=1
    const expected = new Date(NOW.getTime() + 1 * 24 * 60 * 60 * 1000);
    expect(result.due_at).toBe(expected.toISOString());
  });

  it('last_reviewed_at is set to now', () => {
    const card = makeCard();
    const result = applyRating(card, 'good', NOW);
    expect(result.last_reviewed_at).toBe(NOW.toISOString());
  });
});

describe('review_history', () => {
  it('appends each rating to history', () => {
    let card = makeCard();
    card = applyRating(card, 'good', NOW);
    card = applyRating(card, 'hard', NOW);
    expect(card.review_history).toHaveLength(2);
    expect(card.review_history[0]!.rating).toBe('good');
    expect(card.review_history[1]!.rating).toBe('hard');
  });

  it('caps history at 20 entries', () => {
    let card = makeCard();
    // Apply 25 ratings — alternate forgot/hard to keep intervals small
    for (let i = 0; i < 25; i++) {
      card = applyRating(card, i % 2 === 0 ? 'forgot' : 'hard', NOW);
    }
    expect(card.review_history).toHaveLength(20);
  });
});
