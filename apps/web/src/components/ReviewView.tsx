import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../lib/api';

type Rating = 'forgot' | 'hard' | 'good' | 'easy';

interface ReviewCard {
  id: string;
  question: string;
  answer: string;
  source_slug?: string;
  source_excerpt?: string;
  tags: string[];
  interval: number;
  ease_factor: number;
  repetitions: number;
  due_at: string;
  last_reviewed_at?: string;
  review_history: Array<{ at: string; rating: Rating }>;
  archived: boolean;
}

interface Props {
  onBack: () => void;
  onOpenArticle?: (slug: string, path: string) => void;
}

const RATING_KEYS: Record<string, Rating> = {
  '1': 'forgot',
  '2': 'hard',
  '3': 'good',
  '4': 'easy',
};

const RATING_LABELS: Record<Rating, string> = {
  forgot: 'Forgot',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

const RATING_COLORS: Record<Rating, string> = {
  forgot: '#ef4444',
  hard: '#f97316',
  good: '#22c55e',
  easy: '#3b82f6',
};

export function ReviewView({ onBack, onOpenArticle }: Props) {
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [fading, setFading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await apiGet<{ cards: ReviewCard[]; total_due: number }>('/srs/due');
      setCards(r.cards);
      setTotalDue(r.total_due);
      setCurrentIdx(0);
      setFlipped(false);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  const currentCard = cards[currentIdx] ?? null;

  async function submitAnswer(rating: Rating) {
    if (!currentCard || answering) return;
    setAnswering(true);
    setFading(true);

    try {
      await apiPost('/srs/answer', { id: currentCard.id, rating });
    } catch { /* ignore */ }

    // Wait for fade-out
    await new Promise((r) => setTimeout(r, 150));

    setFlipped(false);
    setFading(false);
    setAnswering(false);

    if (currentIdx + 1 >= cards.length) {
      // All done — reload to check for newly due cards
      setCards([]);
      setCurrentIdx(0);
      setLoading(true);
      try {
        const r = await apiGet<{ cards: ReviewCard[]; total_due: number }>('/srs/due');
        setCards(r.cards);
        setTotalDue(r.total_due);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    } else {
      setCurrentIdx((i) => i + 1);
    }
  }

  function skip() {
    if (currentIdx + 1 < cards.length) {
      setFlipped(false);
      setCurrentIdx((i) => i + 1);
    }
  }

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (showHelp) {
        setShowHelp(false);
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!flipped) setFlipped(true);
        return;
      }
      if (e.key === 'b') {
        onBack();
        return;
      }
      if (e.key === '?') {
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === 'ArrowRight') {
        skip();
        return;
      }
      if (flipped && RATING_KEYS[e.key]) {
        void submitAnswer(RATING_KEYS[e.key]!);
        return;
      }
    },
    [flipped, currentIdx, cards, showHelp],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center" style={{ background: 'var(--surface-0)' }}>
        <div className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Loading…</div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col h-full" style={{ background: 'var(--surface-0)' }}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <button onClick={onBack} className="text-[13px] cursor-pointer" style={{ color: 'var(--accent-azure)' }}>← Back</button>
          <div className="text-[12px] font-semibold tracking-tight" style={{ color: 'var(--text-high)' }}>Review</div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          <div className="text-3xl">🎉</div>
          <div className="text-[16px] font-semibold text-center" style={{ color: 'var(--text-high)' }}>All caught up!</div>
          <div className="text-[12px] text-center" style={{ color: 'var(--text-mid)' }}>
            No cards due right now. Check back later or add new cards from wiki articles.
          </div>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 rounded-lg text-[12px] font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text-default)' }}
          >
            Back to knowledge
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--surface-0)' }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <button onClick={onBack} className="text-[13px] cursor-pointer" style={{ color: 'var(--accent-azure)' }}>← Back</button>
        <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
          {currentIdx + 1} of {totalDue > 0 ? totalDue : cards.length} due
        </div>
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="text-[12px] px-2 py-0.5 rounded"
          style={{ color: 'var(--text-faint)', background: 'var(--surface-2)' }}
        >?</button>
      </div>

      {/* Help overlay */}
      {showHelp && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowHelp(false)}
        >
          <div
            className="rounded-xl p-6 max-w-sm w-full mx-4"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}
          >
            <div className="text-[13px] font-semibold mb-4" style={{ color: 'var(--text-high)' }}>Keyboard shortcuts</div>
            <div className="space-y-2">
              {[
                ['Space / Enter', 'Flip card'],
                ['1', 'Forgot'],
                ['2', 'Hard'],
                ['3', 'Good'],
                ['4', 'Easy'],
                ['→ Arrow', 'Skip to next'],
                ['b', 'Back to list'],
                ['?', 'Toggle this help'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <code className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-mid)' }}>{key}</code>
                  <span className="text-[11px]" style={{ color: 'var(--text-mid)' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Card */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 py-8"
        style={{ opacity: fading ? 0 : 1, transition: 'opacity 150ms ease' }}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', minHeight: '280px' }}
        >
          {/* Question */}
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: 'var(--text-faint)' }}>
              Question
            </div>
            <div className="text-[14px] leading-[1.65] font-medium" style={{ color: 'var(--text-high)' }}>
              {currentCard?.question}
            </div>
          </div>

          {/* Flip separator + Answer */}
          {flipped && currentCard && (
            <>
              <div style={{ height: '1px', background: 'var(--border-subtle)' }} />
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: 'var(--text-faint)' }}>
                  Answer
                </div>
                <div className="text-[13px] leading-[1.7]" style={{ color: 'var(--text-default)' }}>
                  {currentCard.answer}
                </div>
                {currentCard.source_excerpt && (
                  <blockquote
                    className="mt-3 pl-3 text-[11.5px] italic leading-[1.6]"
                    style={{ borderLeft: '2px solid var(--border)', color: 'var(--text-faint)' }}
                  >
                    {currentCard.source_excerpt}
                  </blockquote>
                )}
              </div>
            </>
          )}

          {/* Source link */}
          {currentCard?.source_slug && (
            <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
              from{' '}
              <button
                onClick={() => {
                  if (currentCard.source_slug && onOpenArticle) {
                    onOpenArticle(currentCard.source_slug, `wiki/notes/${currentCard.source_slug}.md`);
                  }
                }}
                className="underline cursor-pointer"
                style={{ color: 'var(--accent-azure)' }}
              >
                [[{currentCard.source_slug.replace(/-/g, ' ')}]]
              </button>
            </div>
          )}
        </div>

        {/* Flip button or rating buttons */}
        {!flipped ? (
          <button
            onClick={() => setFlipped(true)}
            className="mt-5 px-6 py-2.5 rounded-full text-[12px] font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text-mid)', border: '1px solid var(--border)' }}
          >
            tap or press space to reveal
          </button>
        ) : (
          <div className="mt-5 flex gap-2">
            {(['forgot', 'hard', 'good', 'easy'] as Rating[]).map((r, i) => (
              <button
                key={r}
                onClick={() => void submitAnswer(r)}
                disabled={answering}
                className="flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: `${RATING_COLORS[r]}20`,
                  color: RATING_COLORS[r],
                  border: `1px solid ${RATING_COLORS[r]}40`,
                }}
              >
                {RATING_LABELS[r]}
                <span className="block text-[9px] opacity-60">{i + 1}</span>
              </button>
            ))}
          </div>
        )}

        {/* Skip */}
        {currentIdx + 1 < cards.length && (
          <button
            onClick={skip}
            className="mt-3 text-[10px]"
            style={{ color: 'var(--text-faint)' }}
          >
            skip →
          </button>
        )}
      </div>
    </div>
  );
}
