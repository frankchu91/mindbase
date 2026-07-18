export type Rating = 'forgot' | 'hard' | 'good' | 'easy';

export interface ReviewCard {
  id: string;
  question: string;
  answer: string;
  source_slug?: string;
  source_excerpt?: string;
  tags: string[];
  created_at: string;
  created_via: 'auto' | 'manual';

  interval: number;       // days
  ease_factor: number;    // 2.5 default, min 1.3
  repetitions: number;
  due_at: string;         // ISO
  last_reviewed_at?: string;
  review_history: Array<{ at: string; rating: Rating }>;
  archived: boolean;
  archived_at?: string;
}

export interface SRSStats {
  total: number;
  due: number;
  mastered: number;       // reps >= 5 AND interval >= 90
  archived: number;
  learning: number;       // reps < 5 AND !archived
  by_tag: Record<string, number>;
}
