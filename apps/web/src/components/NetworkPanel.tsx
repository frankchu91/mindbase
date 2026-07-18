import { useState, useEffect } from 'react';
import { Network as NetworkIcon } from 'lucide-react';
import type { NetworkView } from '@mindbase/core';
import { getNetwork } from '../lib/synthesis';
import { ContradictionCard } from './ContradictionCard';

interface Props {
  slug: string;
  onOpenNote: (slug: string) => void;
  onInsertLink: (targetSlug: string) => void;
}

export function NetworkPanel({ slug, onOpenNote, onInsertLink }: Props) {
  const [data, setData] = useState<NetworkView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getNetwork(slug)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <aside className="w-[260px] shrink-0 p-3" style={{ borderLeft: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2 mb-3 text-[11px]" style={{ color: 'var(--text-mid)' }}>
          <NetworkIcon size={12} /> Network
        </div>
        <div className="skeleton h-3 w-2/3 mb-2" />
        <div className="skeleton h-3 w-3/4 mb-2" />
        <div className="skeleton h-3 w-1/2" />
      </aside>
    );
  }

  if (!data) return null;

  return (
    <aside className="w-[260px] shrink-0 p-3 overflow-y-auto" style={{ borderLeft: '1px solid var(--border-subtle)' }} data-testid="network-panel">
      <div className="flex items-center gap-2 mb-3 text-[11px] uppercase tracking-[2px] font-semibold" style={{ color: 'var(--text-mid)' }}>
        <NetworkIcon size={12} /> Network
      </div>

      {data.semantic_related.length > 0 && (
        <section className="mb-4">
          <div className="text-[11px] mb-1.5 font-medium" style={{ color: 'var(--text-default)' }}>
            Related ({data.semantic_related.length})
          </div>
          {data.semantic_related.map((r) => (
            <button
              key={r.slug}
              onClick={() => onOpenNote(r.slug)}
              className="block w-full text-left text-[12px] py-1 px-2 rounded transition-base"
              style={{ color: 'var(--accent-azure)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {r.slug}
            </button>
          ))}
        </section>
      )}

      {data.missing_links.length > 0 && (
        <section className="mb-4">
          <div className="text-[11px] mb-1.5 font-medium" style={{ color: 'var(--text-default)' }}>
            Missing links ({data.missing_links.length})
          </div>
          {data.missing_links.map((ml) => (
            <div key={ml.slug} className="mb-2 p-2 rounded" style={{ background: 'var(--surface-1)' }}>
              <button
                onClick={() => onOpenNote(ml.slug)}
                className="text-[12px] font-medium"
                style={{ color: 'var(--accent-azure)' }}
              >
                {ml.slug}
              </button>
              <div className="text-[10px] mt-1" style={{ color: 'var(--text-low)' }}>{ml.reason}</div>
              <button
                onClick={() => onInsertLink(ml.slug)}
                className="text-[10px] mt-1 px-1.5 py-0.5 rounded transition-base"
                style={{ color: 'var(--accent-azure)', border: '1px solid var(--border-subtle)' }}
              >
                + Link in body
              </button>
            </div>
          ))}
        </section>
      )}

      {data.contradictions.length > 0 && (
        <section className="mb-4">
          <div className="text-[11px] mb-1.5 font-medium" style={{ color: 'var(--text-default)' }}>
            Contradictions ({data.contradictions.length})
          </div>
          {data.contradictions.map((c, i) => (
            <ContradictionCard key={i} contradiction={c} onReconcile={() => onOpenNote(c.with_slug)} />
          ))}
        </section>
      )}

      {data.mentioned_in.length > 0 && (
        <section>
          <div className="text-[11px] mb-1.5 font-medium" style={{ color: 'var(--text-default)' }}>
            Mentioned in ({data.mentioned_in.length})
          </div>
          {data.mentioned_in.map((m) => (
            <button
              key={m.slug}
              onClick={() => onOpenNote(m.slug)}
              className="block w-full text-left text-[12px] py-1 px-2 rounded transition-base"
              style={{ color: 'var(--accent-azure)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {m.slug}
              <div className="text-[10px] truncate" style={{ color: 'var(--text-low)' }}>{m.snippet}</div>
            </button>
          ))}
        </section>
      )}

      <div className="mt-4 text-[10px]" style={{ color: 'var(--text-faint)' }}>
        Generated {new Date(data.generated_at).toLocaleTimeString()}
      </div>
    </aside>
  );
}
