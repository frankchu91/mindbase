/**
 * ProjectDashboard — the new home (replaces chat-as-home / PulseHome).
 *
 * Per docs/pivot-plan-2026-05-25.md §4, MindBase's home is now project-
 * centric, not chat-centric. It shows what the LLM has been working on:
 * counts of pages, recent compile activity, suggested next actions.
 *
 * This is a Day-1 PLACEHOLDER. The full agent-aware dashboard with
 * approval inbox + activity feed + per-project scope arrives in later
 * phases (P2: agent runtime, P3: project as first-class).
 */

import { useEffect, useState } from 'react';
import { BookOpen, FileText, Inbox, Sparkles, ArrowRight, RefreshCw, AlertTriangle, GitBranch, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { apiGet } from '../../lib/api';
import type { WikiFileSummary, LintReport, LogEntry } from '@mindbase/core';
import { useCanvasRoute } from '../../store/canvas-route';

interface Props {
  onOpenArticle: (slug: string, path: string) => void;
  onOpenReview: () => void;
}

interface Stats {
  knowledgePages: number;
  drafts: number;
  rawSources: number;
  recentKnowledge: Array<{ slug: string; title: string; path: string; updated: string }>;
}

export function ProjectDashboard({ onOpenArticle, onOpenReview: _onOpenReview }: Props) {
  void _onOpenReview;
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lint, setLint] = useState<LintReport | null>(null);
  const [lintExpanded, setLintExpanded] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<{ created: number; updated: number; ingests: number } | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const navigate = useCanvasRoute((s) => s.navigate);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const [wikiResp, notesResp, lintResp, logResp, suggResp] = await Promise.all([
        apiGet<{ files: WikiFileSummary[] }>('/wiki?category=wiki'),
        apiGet<{ files: WikiFileSummary[] }>('/wiki?category=notes'),
        apiGet<LintReport>('/lint?scope=all').catch(() => null),
        fetch('/api/projects/log').then((r) => r.ok ? r.json() as Promise<{ entries: LogEntry[] }> : { entries: [] as LogEntry[] }).catch(() => ({ entries: [] as LogEntry[] })),
        fetch('/api/project/suggestions').then((r) => r.ok ? r.json() as Promise<{ suggestions: string[] }> : { suggestions: [] as string[] }).catch(() => ({ suggestions: [] as string[] })),
      ]);
      const knowledge = wikiResp.files;
      const drafts = notesResp.files.filter((f) => f.kind !== 'raw');
      const raws = notesResp.files.filter((f) => f.kind === 'raw');
      const recent = [...knowledge]
        .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
        .slice(0, 6)
        .map((f) => ({ slug: f.slug, title: f.title, path: f.path, updated: f.updated }));
      setStats({
        knowledgePages: knowledge.length,
        drafts: drafts.length,
        rawSources: raws.length,
        recentKnowledge: recent,
      });
      setLint(lintResp);

      const entries = logResp.entries;
      const recentWeek = entries.filter((e) => Date.now() - Date.parse(e.timestamp) < 7 * 86400_000);
      setLogEntries(entries.slice(0, 10));
      setWeeklyStats({
        ingests: recentWeek.length,
        created: recentWeek.reduce((s, e) => s + (e.bullets['Pages created'] != null ? e.bullets['Pages created'].split(',').length : 0), 0),
        updated: recentWeek.reduce((s, e) => s + (e.bullets['Pages updated'] != null ? e.bullets['Pages updated'].split(',').length : 0), 0),
      });
      setSuggestions(suggResp.suggestions);
    } catch {
      setStats({ knowledgePages: 0, drafts: 0, rawSources: 0, recentKnowledge: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: 'var(--win-bg)' }}
      data-testid="project-dashboard"
    >
      <div className="max-w-[860px] mx-auto px-10 py-10">
        {/* Header */}
        <div className="mb-8">
          <div
            className="text-[11px] uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-faint)' }}
          >
            Project · default
          </div>
          <h1
            className="text-[28px] font-semibold"
            style={{ color: 'var(--text-high)' }}
          >
            Your research wiki
          </h1>
          <p
            className="mt-1 text-[13px]"
            style={{ color: 'var(--text-mid)' }}
          >
            Drop sources. The LLM reads them, files them, and keeps your
            knowledge base structured and cross-referenced.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <StatCard
            icon={BookOpen}
            label="Knowledge pages"
            value={loading ? '—' : String(stats?.knowledgePages ?? 0)}
            sublabel="LLM-maintained"
            accent
          />
          <StatCard
            icon={FileText}
            label="Your drafts"
            value={loading ? '—' : String(stats?.drafts ?? 0)}
            sublabel="user-written"
          />
          <StatCard
            icon={Inbox}
            label="Sources ingested"
            value={loading ? '—' : String(stats?.rawSources ?? 0)}
            sublabel="raw imports"
          />
        </div>

        {/* Weekly summary */}
        {weeklyStats !== null && weeklyStats.ingests > 0 && (
          <div className="mb-6 px-4 py-3 rounded-md text-[12.5px]" style={{ background: 'var(--bg-2)', border: '0.5px solid var(--hairline)' }}>
            <div className="font-medium" style={{ color: 'var(--text-high)' }}>This week</div>
            <div style={{ color: 'var(--text-mid)' }}>
              +{weeklyStats.created} pages, +{weeklyStats.updated} updates from {weeklyStats.ingests} ingest{weeklyStats.ingests === 1 ? '' : 's'}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-mid)' }}>
              Suggested next steps
            </div>
            <div className="space-y-1">
              {suggestions.map((s, i) => (
                <div key={i} className="text-[12.5px] px-3 py-2 rounded" style={{ background: 'var(--bg-2)', color: 'var(--text-default)' }}>
                  → {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lint — the wiki's health card (Karpathy spec). Only Notion/NotebookLM/
            Obsidian can't surface "orphan pages" / "mentioned but missing" / "stale". */}
        {lint && lint.findings.length > 0 && (
          <div
            className="mb-6 rounded-md overflow-hidden"
            style={{
              background: 'var(--bg-2)',
              border: '0.5px solid var(--hairline)',
            }}
            data-testid="lint-card"
          >
            <button
              onClick={() => setLintExpanded((v) => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 cursor-pointer text-left"
              style={{ background: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {lintExpanded
                ? <ChevronDown size={13} strokeWidth={1.8} style={{ color: 'var(--text-mid)' }} />
                : <ChevronRight size={13} strokeWidth={1.8} style={{ color: 'var(--text-mid)' }} />}
              <AlertTriangle size={13} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
              <span className="text-[12.5px] font-medium" style={{ color: 'var(--text-high)' }}>
                Wiki health
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-mid)' }}>
                · {lint.findings.length} thing{lint.findings.length === 1 ? '' : 's'} to look at
              </span>
              <div className="ml-auto flex items-center gap-3 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                {lint.byKind.orphan > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <GitBranch size={10} /> {lint.byKind.orphan} orphan{lint.byKind.orphan === 1 ? '' : 's'}
                  </span>
                )}
                {lint.byKind['missing-concept'] > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles size={10} /> {lint.byKind['missing-concept']} missing
                  </span>
                )}
                {lint.byKind['stale-page'] > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Clock size={10} /> {lint.byKind['stale-page']} stale
                  </span>
                )}
                {lint.byKind['cross-project-duplicate'] > 0 && (
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: 'rgb(155, 109, 220)' }}
                    title="Same slug exists in 2+ projects — candidates for cross-project links"
                  >
                    <GitBranch size={10} /> {lint.byKind['cross-project-duplicate']} cross-proj
                  </span>
                )}
              </div>
            </button>
            {lintExpanded && (
              <div className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                {lint.findings.slice(0, 20).map((f, i) => (
                  <div
                    key={`${f.kind}:${f.slug}:${i}`}
                    className="px-4 py-2.5 text-[11.5px] flex items-start gap-2"
                    style={{
                      borderTop: i > 0 ? '0.5px solid var(--hairline)' : 'none',
                    }}
                  >
                    <LintKindIcon kind={f.kind} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium" style={{ color: 'var(--text-high)' }}>
                        {f.kind === 'missing-concept' ? f.slug : (
                          <button
                            onClick={() => {
                              // Best-effort: try opening as a concept first, then note
                              onOpenArticle(f.slug, `wiki/concepts/${f.slug}.md`);
                            }}
                            className="hover:underline cursor-pointer"
                            style={{ background: 'transparent', border: 'none', color: 'inherit', padding: 0 }}
                          >
                            {f.title}
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-mid)' }}>
                        {f.reason}
                      </div>
                    </div>
                  </div>
                ))}
                {lint.findings.length > 20 && (
                  <div className="px-4 py-2 text-[11px]" style={{ color: 'var(--text-faint)', borderTop: '0.5px solid var(--hairline)' }}>
                    + {lint.findings.length - 20} more (showing first 20)
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Activity timeline */}
        {logEntries.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-mid)' }}>
              Activity timeline
            </div>
            <div className="space-y-1">
              {logEntries.map((e, i) => (
                <div key={i} className="text-[12px] flex items-baseline gap-3 px-3 py-1.5">
                  <span className="text-[10.5px] font-mono" style={{ color: 'var(--text-faint)' }}>
                    {new Date(e.timestamp).toLocaleDateString()}
                  </span>
                  <span style={{ color: 'var(--text-mid)' }}>{e.kind}</span>
                  <span className="flex-1 truncate" style={{ color: 'var(--text-high)' }}>{e.title}</span>
                  {e.bullets['Total actions'] != null && (
                    <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                      {e.bullets['Total actions']} actions
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent knowledge */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div
              className="text-[11px] uppercase tracking-wider font-semibold"
              style={{ color: 'var(--text-mid)' }}
            >
              Recent knowledge
            </div>
            <button
              onClick={() => void load()}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded cursor-pointer"
              style={{ color: 'var(--text-mid)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              title="Refresh"
            >
              <RefreshCw size={11} strokeWidth={1.8} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <div className="skeleton h-12 w-full rounded" />
              <div className="skeleton h-12 w-full rounded" />
              <div className="skeleton h-12 w-full rounded" />
            </div>
          ) : stats?.recentKnowledge.length === 0 ? (
            <div
              className="rounded-md p-5 text-center"
              style={{ background: 'var(--bg-2)', border: '0.5px solid var(--hairline)' }}
            >
              <Sparkles size={20} strokeWidth={1.5} style={{ color: 'var(--text-faint)', display: 'inline-block' }} />
              <div className="mt-2 text-[13px] font-medium" style={{ color: 'var(--text-mid)' }}>
                Your wiki is empty.
              </div>
              <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
                Drop a PDF, paste a URL, or open the Drafts tab and add a note. The LLM
                will read it and build your first concept pages.
              </div>
              <button
                onClick={() => navigate({ kind: 'ingest' })}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded text-[12px] cursor-pointer"
                style={{
                  background: 'var(--accent-soft, var(--bg-3))',
                  color: 'var(--accent)',
                  border: '0.5px solid var(--hairline)',
                }}
              >
                <Inbox size={12} strokeWidth={1.8} />
                Ingest a source
                <ArrowRight size={12} strokeWidth={1.8} />
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {stats!.recentKnowledge.map((p) => (
                <button
                  key={p.slug}
                  onClick={() => onOpenArticle(p.slug, p.path)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-left"
                  style={{ background: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <BookOpen size={13} strokeWidth={1.8} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] truncate" style={{ color: 'var(--text-high)' }}>
                      {p.title}
                    </div>
                    <div className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                      {relativeTime(p.updated)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Roadmap note (placeholder honesty — Day-1 dashboard) */}
        <div
          className="rounded-md p-3 mt-12 text-[11px]"
          style={{
            background: 'var(--bg-2)',
            border: '0.5px solid var(--hairline)',
            color: 'var(--text-faint)',
          }}
        >
          <strong style={{ color: 'var(--text-mid)' }}>Coming next:</strong>{' '}
          per-project scope, agent activity feed, approval inbox for risky
          LLM actions, lint cards (contradictions / orphans / stale claims),
          and a current-thesis page that the agent maintains automatically.
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  accent,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
  sublabel: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-md p-4"
      style={{
        background: 'var(--bg-2)',
        border: accent ? '0.5px solid var(--accent)' : '0.5px solid var(--hairline)',
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} strokeWidth={1.8} style={{ color: accent ? 'var(--accent)' : 'var(--text-mid)' }} />
        <div className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-mid)' }}>
          {label}
        </div>
      </div>
      <div className="text-[24px] font-semibold leading-tight" style={{ color: 'var(--text-high)' }}>
        {value}
      </div>
      <div className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
        {sublabel}
      </div>
    </div>
  );
}

function LintKindIcon({ kind }: { kind: 'orphan' | 'missing-concept' | 'stale-page' | 'cross-project-duplicate' }): React.ReactNode {
  const style = { color: 'var(--text-mid)', flexShrink: 0, marginTop: 1 };
  switch (kind) {
    case 'orphan': return <GitBranch size={12} strokeWidth={1.8} style={style} />;
    case 'missing-concept': return <Sparkles size={12} strokeWidth={1.8} style={style} />;
    case 'stale-page': return <Clock size={12} strokeWidth={1.8} style={style} />;
    case 'cross-project-duplicate': return <GitBranch size={12} strokeWidth={1.8} style={{ ...style, color: 'rgb(155, 109, 220)' }} />;
  }
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}
