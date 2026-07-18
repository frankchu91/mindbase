import { useState, useEffect } from 'react';
import { Sparkles, AlertTriangle, Lightbulb, Inbox as InboxIcon, Brain, RefreshCw } from 'lucide-react';
import type { PulseSnapshot } from '@mindbase/core';
import { getPulse, getAnalysisInsights, type AnalysisInsightsPayload } from '../lib/synthesis';
import { WikiHealthSection } from './WikiHealthSection';

interface Props {
  onOpenArticle: (slug: string, path: string) => void;
  onOpenReview: () => void;
}

export function PulseHome({ onOpenArticle, onOpenReview }: Props) {
  const [data, setData] = useState<PulseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<AnalysisInsightsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPulse()
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAnalysisInsights().then((d) => { if (!cancelled) setInsights(d); });
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const d = await getPulse(undefined, true);
      setData(d);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-10" data-testid="pulse-home-loading">
        <div className="skeleton h-6 w-1/3 mb-6" />
        <div className="skeleton h-3 w-full mb-2" />
        <div className="skeleton h-3 w-5/6 mb-2" />
        <div className="skeleton h-3 w-4/6" />
      </div>
    );
  }

  if (!data || (
    data.weekly_writes.length === 0 &&
    data.contradictions.length === 0 &&
    data.new_connections.length === 0 &&
    data.stale_notes.length === 0 &&
    data.srs_due_count === 0
  )) {
    return (
      <div className="max-w-xl mx-auto px-8 py-16 text-center" data-testid="pulse-home-empty">
        <div className="hero-mark mx-auto mb-6"></div>
        <div className="text-[28px] font-semibold mb-3" style={{ color: 'var(--text-high)' }}>
          Welcome to MindBase.
        </div>
        <div className="text-[13px] leading-[1.6] mb-6" style={{ color: 'var(--text-mid)' }}>
          Your wiki's empty. Once you write a few notes, this space shows you<br />
          this week's writes, connections, things you're forgetting, and SRS cards.
        </div>
        <div className="text-[11px]" style={{ color: 'var(--text-low)' }}>
          Try ⌥⌘N (new note) or ⌥⌘D (today's daily).
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10" data-testid="pulse-home">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="text-[28px] font-semibold inline-flex items-center gap-3" style={{ color: 'var(--text-high)' }}>
          <Sparkles size={22} strokeWidth={1.6} style={{ color: 'var(--accent-azure)' }} />
          {data.greeting}
        </h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="icon-button text-[10px] flex items-center gap-1 px-2 py-1 disabled:opacity-50"
          aria-label="Refresh pulse"
        >
          <RefreshCw size={11} strokeWidth={1.6} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="text-[13px] mb-6" style={{ color: 'var(--text-mid)' }}>
        Your wiki this week.
      </div>

      <WikiHealthSection onOpenNote={onOpenArticle} />

      {data.weekly_writes.length > 0 && (
        <Section label="This week you wrote">
          {data.weekly_writes.map((w) => (
            <Row key={w.slug} onClick={() => onOpenArticle(w.slug, `wiki/notes/${w.slug}.md`)}>
              <span className="text-[13px]" style={{ color: 'var(--text-high)' }}>{w.title}</span>
              <span className="text-[10px] ml-auto" style={{ color: 'var(--text-faint)' }}>
                {fmtAgo(w.written_at)}
              </span>
            </Row>
          ))}
        </Section>
      )}

      {data.contradictions.length > 0 && (
        <Section label="I noticed" icon={<AlertTriangle size={12} strokeWidth={1.8} style={{ color: 'var(--accent-amber)' }} />}>
          {data.contradictions.map((c, i) => (
            <Row key={i} onClick={() => onOpenArticle(c.with_slug, `wiki/notes/${c.with_slug}.md`)}>
              <div>
                <div className="text-[12px]" style={{ color: 'var(--text-high)' }}>{c.explanation ?? 'Contradiction'}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-low)' }}>with {c.with_slug}</div>
              </div>
            </Row>
          ))}
        </Section>
      )}

      {data.new_connections.length > 0 && (
        <Section label="New connections" icon={<Lightbulb size={12} strokeWidth={1.8} style={{ color: 'var(--accent-amber)' }} />}>
          {data.new_connections.map((nc, i) => (
            <Row key={i} onClick={() => onOpenArticle(nc.from_slug, `wiki/notes/${nc.from_slug}.md`)}>
              <div>
                <div className="text-[12px]" style={{ color: 'var(--text-high)' }}>
                  {nc.from_slug} ↔ {nc.to_slug}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-low)' }}>{nc.reason}</div>
              </div>
            </Row>
          ))}
        </Section>
      )}

      {data.stale_notes.length > 0 && (
        <Section label="Forgotten" icon={<InboxIcon size={12} strokeWidth={1.8} />}>
          {data.stale_notes.map((s) => (
            <Row key={s.slug} onClick={() => onOpenArticle(s.slug, `wiki/notes/${s.slug}.md`)}>
              <span className="text-[12px]" style={{ color: 'var(--text-high)' }}>{s.title}</span>
              <span className="text-[10px] ml-auto" style={{ color: 'var(--text-faint)' }}>
                {s.days_since}d idle
              </span>
            </Row>
          ))}
        </Section>
      )}

      {data.srs_due_count > 0 && (
        <Section label="Review" icon={<Brain size={12} strokeWidth={1.8} />}>
          <Row onClick={onOpenReview}>
            <span className="text-[12px]" style={{ color: 'var(--text-high)' }}>
              {data.srs_due_count} card{data.srs_due_count === 1 ? '' : 's'} due today
            </span>
            <span className="text-[10px] ml-auto" style={{ color: 'var(--accent-azure)' }}>Start →</span>
          </Row>
        </Section>
      )}

      {insights && (
        <>
          {/* I noticed (suggestions) */}
          {insights.suggestions.length > 0 && (
            <section className="mt-8" data-testid="pulse-suggestions">
              <h3 className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-mid)', letterSpacing: '0.08em', fontWeight: 600 }}>
                I noticed
              </h3>
              <ul className="space-y-2">
                {insights.suggestions.map((s, i) => (
                  <li key={i} className="text-sm" style={{ color: 'var(--text-default)' }}>
                    <span
                      style={{
                        display: 'inline-block', marginRight: 8, padding: '0 6px', borderRadius: 4, fontSize: 10,
                        background: s.severity === 'high' ? '#ef444422' : s.severity === 'medium' ? '#fbbf2422' : '#94a3b822',
                        color: s.severity === 'high' ? '#ef4444' : s.severity === 'medium' ? '#fbbf24' : '#94a3b8',
                        fontWeight: 600, textTransform: 'uppercase',
                      }}
                    >{s.severity}</span>
                    {s.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Confirmed contradictions */}
          {insights.contradictions.length > 0 && (
            <section className="mt-6" data-testid="pulse-contradictions">
              <h3 className="text-xs uppercase tracking-wider mb-3" style={{ color: '#ef4444', letterSpacing: '0.08em', fontWeight: 600 }}>
                Possible contradictions
              </h3>
              <ul className="space-y-1">
                {insights.contradictions.slice(0, 5).map((c, i) => (
                  <li key={i} className="text-sm" style={{ color: 'var(--text-default)' }}>
                    <button
                      onClick={() => onOpenArticle(c.slugA, `wiki/notes/${c.slugA}.md`)}
                      style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                    >[[{c.slugA}]]</button>
                    {' vs '}
                    <button
                      onClick={() => onOpenArticle(c.slugB, `wiki/notes/${c.slugB}.md`)}
                      style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                    >[[{c.slugB}]]</button>
                    <span style={{ color: 'var(--text-mid)' }}> — {c.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Knowledge clusters */}
          {insights.communities.length > 0 && (
            <section className="mt-6" data-testid="pulse-communities">
              <h3 className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-mid)', letterSpacing: '0.08em', fontWeight: 600 }}>
                Your knowledge clusters
              </h3>
              <ul className="space-y-1">
                {[...insights.communities].sort((a, b) => b.size - a.size).slice(0, 8).map((c) => (
                  <li key={c.id} className="text-sm" style={{ color: 'var(--text-default)' }}>
                    {c.label} <span style={{ color: 'var(--text-mid)' }}>· {c.size} {c.size === 1 ? 'page' : 'pages'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Bridges */}
          {insights.bridgeNodes.length > 0 && (
            <section className="mt-6" data-testid="pulse-bridges">
              <h3 className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-mid)', letterSpacing: '0.08em', fontWeight: 600 }}>
                Bridges in your wiki
              </h3>
              <ul className="space-y-1">
                {insights.bridgeNodes.slice(0, 5).map((b) => (
                  <li key={b.slug} className="text-sm" style={{ color: 'var(--text-default)' }}>
                    <button
                      onClick={() => onOpenArticle(b.slug, `wiki/notes/${b.slug}.md`)}
                      style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                    >[[{b.title}]]</button>
                    <span style={{ color: 'var(--text-mid)' }}> — connects {b.communityCount} clusters</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Disconnected */}
          {insights.orphanClusters.length > 0 && (
            <section className="mt-6" data-testid="pulse-orphans">
              <h3 className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-mid)', letterSpacing: '0.08em', fontWeight: 600 }}>
                Disconnected
              </h3>
              <ul className="space-y-1">
                {insights.orphanClusters.slice(0, 5).map((o, i) => (
                  <li key={i} className="text-sm" style={{ color: 'var(--text-default)' }}>
                    {o.size === 1
                      ? <button
                          onClick={() => onOpenArticle(o.slugs[0]!, `wiki/notes/${o.slugs[0]}.md`)}
                          style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                        >[[{o.slugs[0]}]]</button>
                      : <span>{o.size} pages starting with <button
                          onClick={() => onOpenArticle(o.slugs[0]!, `wiki/notes/${o.slugs[0]}.md`)}
                          style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                        >[[{o.slugs[0]}]]</button></span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 text-[10.5px] tracking-[2px] uppercase font-semibold mb-2" style={{ color: 'var(--text-mid)' }}>
        {icon}
        {label}
      </div>
      {children}
    </section>
  );
}

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-baseline py-2 px-3 -mx-3 rounded-md transition-base"
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return '1d ago';
  return `${d}d ago`;
}
