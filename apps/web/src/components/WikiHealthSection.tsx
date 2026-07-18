import { useState, useEffect } from 'react';
import { Activity, Link2Off, GitFork, RefreshCw } from 'lucide-react';
import { getInsights, type InsightsReport } from '../lib/synthesis';

interface Props {
  onOpenNote: (slug: string, path: string) => void;
}

export function WikiHealthSection({ onOpenNote }: Props) {
  const [data, setData] = useState<InsightsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInsights()
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try { setData(await getInsights(true)); }
    finally { setRefreshing(false); }
  }

  if (loading) {
    return (
      <section className="mb-6" data-testid="wiki-health-loading">
        <div className="text-[10.5px] uppercase tracking-[2px] font-semibold mb-2" style={{ color: 'var(--text-mid)' }}>
          Wiki Health
        </div>
        <div className="skeleton h-4 w-3/4 mb-2" />
        <div className="skeleton h-4 w-2/3" />
      </section>
    );
  }

  if (!data) return null;
  if (data.orphans.length === 0 && data.broken_links.length === 0 && data.hubs.length === 0) return null;

  return (
    <section className="mb-6" data-testid="wiki-health">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10.5px] uppercase tracking-[2px] font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text-mid)' }}>
          <Activity size={12} strokeWidth={1.8} /> Wiki Health
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded transition-base disabled:opacity-50"
          style={{ color: 'var(--text-mid)' }}
        >
          <RefreshCw size={10} strokeWidth={1.6} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Running…' : 'Run check'}
        </button>
      </div>

      {data.hubs.length > 0 && (
        <Row>
          <GitFork size={12} strokeWidth={1.8} style={{ color: 'var(--accent-azure)' }} />
          <span className="text-[12px]" style={{ color: 'var(--text-high)' }}>
            Top hubs:{' '}
            {data.hubs.slice(0, 3).map((h, i) => (
              <span key={h.slug}>
                <button
                  onClick={() => onOpenNote(h.slug, `wiki/notes/${h.slug}.md`)}
                  className="hover:underline"
                  style={{ color: 'var(--accent-azure)' }}
                >
                  {h.slug}
                </button>
                <span style={{ color: 'var(--text-faint)' }}> ({h.in_count} in)</span>
                {i < 2 && i < data.hubs.length - 1 ? ', ' : ''}
              </span>
            ))}
          </span>
        </Row>
      )}

      {data.orphans.length > 0 && (
        <Row>
          <Link2Off size={12} strokeWidth={1.8} style={{ color: 'var(--accent-amber)' }} />
          <span className="text-[12px]" style={{ color: 'var(--text-high)' }}>
            {data.orphans.length} orphan page{data.orphans.length === 1 ? '' : 's'} — no inbound links
          </span>
          <span className="text-[10px] ml-2" style={{ color: 'var(--text-low)' }}>
            ({data.orphans.slice(0, 3).join(', ')}{data.orphans.length > 3 ? '…' : ''})
          </span>
        </Row>
      )}

      {data.broken_links.length > 0 && (
        <Row>
          <Link2Off size={12} strokeWidth={1.8} style={{ color: 'var(--accent-amber)' }} />
          <span className="text-[12px]" style={{ color: 'var(--text-high)' }}>
            {data.broken_links.length} broken wikilink{data.broken_links.length === 1 ? '' : 's'}
          </span>
        </Row>
      )}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 -mx-3 rounded-md">
      {children}
    </div>
  );
}
