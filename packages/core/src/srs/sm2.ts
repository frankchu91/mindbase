import type { ReviewCard, Rating } from './types';

const MIN_EF = 1.3;

export function applyRating(card: ReviewCard, rating: Rating, now: Date = new Date()): ReviewCard {
  let { interval, ease_factor, repetitions } = card;

  if (rating === 'forgot') {
    repetitions = 0;
    interval = 1;
    // ease_factor unchanged (simple variant)
  } else if (rating === 'hard') {
    interval = Math.max(1, Math.round(interval * 1.2));
    ease_factor = Math.max(MIN_EF, ease_factor - 0.15);
  } else if (rating === 'good') {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * ease_factor);
    repetitions += 1;
  } else if (rating === 'easy') {
    if (repetitions === 0) interval = 4;
    else if (repetitions === 1) interval = 7;
    else interval = Math.round(interval * ease_factor * 1.3);
    ease_factor = ease_factor + 0.15;
    repetitions += 1;
  }

  const dueAt = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
  const history = [...card.review_history, { at: now.toISOString(), rating }].slice(-20); // cap at 20

  return {
    ...card,
    interval,
    ease_factor,
    repetitions,
    due_at: dueAt.toISOString(),
    last_reviewed_at: now.toISOString(),
    review_history: history,
  };
}

export function newCard(input: {
  id: string;
  question: string;
  answer: string;
  source_slug?: string;
  source_excerpt?: string;
  tags?: string[];
  created_via?: 'auto' | 'manual';
  now?: Date;
}): ReviewCard {
  const now = input.now ?? new Date();
  return {
    id: input.id,
    question: input.question,
    answer: input.answer,
    source_slug: input.source_slug,
    source_excerpt: input.source_excerpt,
    tags: input.tags ?? [],
    created_at: now.toISOString(),
    created_via: input.created_via ?? 'auto',
    interval: 0,
    ease_factor: 2.5,
    repetitions: 0,
    due_at: now.toISOString(), // immediately due
    review_history: [],
    archived: false,
  };
}
