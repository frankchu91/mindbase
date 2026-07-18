import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api';

type Rating = 'forgot' | 'hard' | 'good' | 'easy';

interface ReviewCard {
  id: string;
  question: string;
  answer: string;
  source_slug?: string;
  source_excerpt?: string;
  tags: string[];
  interval: number;
  repetitions: number;
  due_at: string;
  archived: boolean;
  created_via: 'auto' | 'manual';
}

interface Props {
  slug: string;
}

function relDue(isoDate: string): string {
  const diffMs = new Date(isoDate).getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'due now';
  if (diffDays === 1) return 'in 1 day';
  return `in ${diffDays} days`;
}

export function CardsOnArticle({ slug }: Props) {
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [addingCard, setAddingCard] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState('');
  const [editA, setEditA] = useState('');

  useEffect(() => {
    load();
  }, [slug]);

  async function load() {
    setLoading(true);
    try {
      const r = await apiGet<{ cards: ReviewCard[] }>(`/srs/cards?slug=${encodeURIComponent(slug)}&include_archived=true`);
      setCards(r.cards);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const r = await apiPost<{ cards: ReviewCard[]; created_now: number }>(`/srs/extract/${encodeURIComponent(slug)}`, {});
      setCards(r.cards);
    } catch { /* ignore */ } finally {
      setGenerating(false);
    }
  }

  async function addCard() {
    if (!newQ.trim() || !newA.trim()) return;
    setAddingCard(true);
    try {
      const r = await apiPost<{ card: ReviewCard }>('/srs/cards', {
        question: newQ.trim(),
        answer: newA.trim(),
        source_slug: slug,
        created_via: 'manual',
      });
      setCards((prev) => [...prev, r.card]);
      setNewQ('');
      setNewA('');
      setShowAddForm(false);
    } catch { /* ignore */ } finally {
      setAddingCard(false);
    }
  }

  async function saveEdit(id: string) {
    try {
      const r = await apiPut<{ card: ReviewCard }>(`/srs/cards/${id}`, { question: editQ.trim(), answer: editA.trim() });
      setCards((prev) => prev.map((c) => (c.id === id ? r.card : c)));
      setEditingId(null);
    } catch { /* ignore */ }
  }

  async function suspend(id: string, archived: boolean) {
    try {
      const r = await apiPut<{ card: ReviewCard }>(`/srs/cards/${id}`, { archived });
      setCards((prev) => prev.map((c) => (c.id === id ? r.card : c)));
    } catch { /* ignore */ }
  }

  async function deleteCard(id: string) {
    try {
      await apiDelete<{ ok: boolean }>(`/srs/cards/${id}`);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch { /* ignore */ }
  }

  function startEdit(card: ReviewCard) {
    setEditingId(card.id);
    setEditQ(card.question);
    setEditA(card.answer);
  }

  const active = cards.filter((c) => !c.archived);
  const archived = cards.filter((c) => c.archived);

  if (loading) return null;

  return (
    <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-mid)' }}>
          Review cards ({active.length})
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="text-[11px] px-2 py-1 rounded-md transition-colors"
          style={{ color: 'var(--accent-azure)', background: 'var(--surface-2)' }}
        >
          + Add card
        </button>
      </div>

      {/* Add card form */}
      {showAddForm && (
        <div className="mb-4 p-3 rounded-lg space-y-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <textarea
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
            placeholder="Question…"
            rows={2}
            className="w-full text-[12px] p-2 rounded-md outline-none resize-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-default)' }}
          />
          <textarea
            value={newA}
            onChange={(e) => setNewA(e.target.value)}
            placeholder="Answer…"
            rows={2}
            className="w-full text-[12px] p-2 rounded-md outline-none resize-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-default)' }}
          />
          <div className="flex gap-2">
            <button
              onClick={addCard}
              disabled={addingCard || !newQ.trim() || !newA.trim()}
              className="px-3 py-1 rounded-md text-[11px] font-medium disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {addingCard ? 'Saving…' : 'Save card'}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewQ(''); setNewA(''); }}
              className="px-3 py-1 rounded-md text-[11px]"
              style={{ color: 'var(--text-faint)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active cards list */}
      {active.length === 0 && !showAddForm && (
        <div className="text-[11px] mb-3" style={{ color: 'var(--text-faint)' }}>
          No cards yet. Generate them automatically or add one manually.
        </div>
      )}

      <div className="space-y-2">
        {active.map((card) => (
          <div key={card.id} className="p-3 rounded-lg" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            {editingId === card.id ? (
              <div className="space-y-2">
                <textarea
                  value={editQ}
                  onChange={(e) => setEditQ(e.target.value)}
                  rows={2}
                  className="w-full text-[12px] p-2 rounded-md outline-none resize-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-default)' }}
                />
                <textarea
                  value={editA}
                  onChange={(e) => setEditA(e.target.value)}
                  rows={2}
                  className="w-full text-[12px] p-2 rounded-md outline-none resize-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-default)' }}
                />
                <div className="flex gap-2">
                  <button onClick={() => void saveEdit(card.id)} className="px-3 py-1 rounded-md text-[11px] font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>Save</button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1 rounded-md text-[11px]" style={{ color: 'var(--text-faint)' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-high)' }}>
                  Q: {card.question}
                </div>
                <div className="text-[11.5px] mb-2" style={{ color: 'var(--text-default)' }}>
                  A: {card.answer}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                    Next review: {relDue(card.due_at)} · {card.repetitions} reps
                    {card.created_via === 'auto' && <span className="ml-1 opacity-60">(auto)</span>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(card)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--text-mid)', background: 'var(--surface-2)' }}>edit</button>
                    <button onClick={() => void suspend(card.id, true)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--text-mid)', background: 'var(--surface-2)' }}>suspend</button>
                    <button onClick={() => void deleteCard(card.id)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#ef4444', background: 'var(--surface-2)' }}>delete</button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Suspended cards */}
      {archived.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
            Suspended ({archived.length})
          </div>
          {archived.map((card) => (
            <div key={card.id} className="px-3 py-2 rounded-lg mb-1 flex items-center justify-between" style={{ background: 'var(--surface-1)', opacity: 0.6 }}>
              <div className="text-[11px] truncate" style={{ color: 'var(--text-mid)' }}>{card.question}</div>
              <button
                onClick={() => void suspend(card.id, false)}
                className="text-[10px] px-1.5 py-0.5 rounded ml-2 shrink-0"
                style={{ color: 'var(--accent-azure)', background: 'var(--surface-2)' }}
              >
                unsuspend
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Generate more */}
      <div className="mt-3">
        <button
          onClick={generate}
          disabled={generating}
          className="w-full py-2 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50"
          style={{ background: 'var(--surface-2)', color: 'var(--text-mid)', border: '1px solid var(--border)' }}
        >
          {generating ? 'Generating cards…' : 'Generate more cards'}
        </button>
      </div>
    </div>
  );
}
