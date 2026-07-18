import { useState } from 'react';
import { Activity } from 'lucide-react';
import { apiSSE } from '../lib/api';

interface HealthSummary {
  insights: { pageCount: number; edgeCount: number; hubs: Array<{ slug: string; title: string; incoming: number }>; orphans: number; brokenLinks: number };
  crosslink: { applied: number; pagesModified: number };
  lintActions: number;
}

interface Props {
  onBack: () => void;
  onWikiChanged: () => void;
}

export function WikiHealthView({ onBack, onWikiChanged }: Props) {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (running) return;
    setRunning(true);
    setError(null);
    setSummary(null);
    setPhase('starting');
    apiSSE('/lint', {}, (event) => {
      if (event.kind === 'progress') {
        setPhase((event as unknown as { phase: string }).phase);
      } else if (event.kind === 'done') {
        const e = event as unknown as HealthSummary & { ok: boolean; error?: string };
        if (!e.ok && e.error) setError(e.error);
        setSummary(e);
        setRunning(false);
        onWikiChanged();
      } else if (event.kind === 'error') {
        setError((event as unknown as { error: string }).error);
        setRunning(false);
      }
    });
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-sidebar)' }}>
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={onBack} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>←</button>
        <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Activity size={14} strokeWidth={1.6} />
          Wiki Health
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {!summary && !running && (
          <>
            <div className="hero-mark mb-6 mx-auto"></div>
            <div className="text-[10.5px] tracking-[3px] uppercase font-medium text-center mb-3" style={{ color: 'var(--text-low)' }}>
              Wiki Health
            </div>
            <div className="text-[24px] font-bold text-center leading-[1.1] tracking-[-0.8px] mb-3" style={{ color: 'var(--text-high)' }}>
              Tend to your<br /><span className="accent-italic">knowledge garden.</span>
            </div>
            <div className="text-[12px] text-center leading-[1.55] mb-7" style={{ color: 'var(--text-mid)' }}>
              Analyze structure, weave cross-links,<br />and let the LLM polish your wiki.
            </div>
            <button
              onClick={run}
              className="py-2.5 rounded-[10px] text-[12px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--text-inverse)' }}
            >
              Run Wiki Health Check
            </button>
          </>
        )}

        {running && (
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <div className="mb-2">Running...</div>
            <div>· {phase}</div>
          </div>
        )}

        {error && (
          <div className="text-xs px-3 py-2 rounded-md" style={{ background: 'var(--error-bg)', color: 'var(--error)' }}>
            Error: {error}
          </div>
        )}

        {summary && (
          <>
            {/* Hero header */}
            <div className="mb-2">
              <div className="text-[9.5px] tracking-[2px] uppercase font-semibold mb-2" style={{ color: 'var(--text-mid)' }}>
                Analysis · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div className="text-[26px] font-bold leading-[1.1] tracking-[-0.8px]"
                style={{
                  background: 'linear-gradient(135deg, var(--text-high) 0%, var(--accent-amber) 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                {summary.insights.orphans === 0 && summary.insights.brokenLinks === 0
                  ? 'Your knowledge is well-connected.'
                  : `${summary.insights.orphans + summary.insights.brokenLinks} things to fix.`}
              </div>
            </div>

            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3.5 rounded-[10px] glass-card">
                <div className="text-[24px] font-bold tracking-[-0.5px]" style={{ color: 'var(--text-high)' }}>
                  {summary.insights.pageCount}
                </div>
                <div className="text-[10px] uppercase tracking-[0.5px] mt-0.5" style={{ color: 'var(--text-low)' }}>Pages</div>
              </div>
              <div className="p-3.5 rounded-[10px] glass-card">
                <div className="text-[24px] font-bold tracking-[-0.5px]" style={{ color: 'var(--text-high)' }}>
                  {summary.insights.edgeCount}
                </div>
                <div className="text-[10px] uppercase tracking-[0.5px] mt-0.5" style={{ color: 'var(--text-low)' }}>Cross-links</div>
              </div>
              <div className="p-3.5 rounded-[10px] glass-card">
                <div className="text-[24px] font-bold tracking-[-0.5px]"
                  style={{ color: summary.insights.orphans > 0 ? 'var(--accent-amber)' : 'var(--text-high)' }}>
                  {summary.insights.orphans}
                </div>
                <div className="text-[10px] uppercase tracking-[0.5px] mt-0.5" style={{ color: 'var(--text-low)' }}>Orphans</div>
              </div>
              <div className="p-3.5 rounded-[10px] glass-card">
                <div className="text-[24px] font-bold tracking-[-0.5px]"
                  style={{ color: summary.insights.brokenLinks > 0 ? 'var(--accent-amber)' : 'var(--text-high)' }}>
                  {summary.insights.brokenLinks}
                </div>
                <div className="text-[10px] uppercase tracking-[0.5px] mt-0.5" style={{ color: 'var(--text-low)' }}>Broken links</div>
              </div>
            </div>

            {/* Top hubs */}
            {summary.insights.hubs.length > 0 && (
              <div className="mt-4">
                <div className="text-[9.5px] tracking-[1.5px] uppercase font-semibold mb-2.5" style={{ color: 'var(--text-mid)' }}>
                  Top Hubs
                </div>
                <div className="flex flex-col gap-1">
                  {summary.insights.hubs.map((h) => {
                    const max = Math.max(...summary.insights.hubs.map((x) => x.incoming));
                    const pct = max > 0 ? (h.incoming / max) * 100 : 0;
                    return (
                      <div key={h.slug} className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] glass-card">
                        <span className="text-[12px] flex-1 min-w-[120px] truncate" style={{ color: 'var(--text-high)' }}>{h.title}</span>
                        <div className="flex-1 h-1 rounded overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                          <div className="h-full rounded" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--accent-azure), var(--accent-amber))' }} />
                        </div>
                        <span className="text-[11px] min-w-[28px] text-right" style={{ color: 'var(--text-mid)' }}>{h.incoming}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Last run improved */}
            <div className="mt-4">
              <div className="text-[9.5px] tracking-[1.5px] uppercase font-semibold mb-2.5" style={{ color: 'var(--text-mid)' }}>
                Last Run Improved
              </div>
              <div className="text-[12px] leading-[1.65]" style={{ color: 'var(--text-default)' }}>
                <div>• Auto-applied <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>{summary.crosslink.applied}</span> cross-links across {summary.crosslink.pagesModified} pages</div>
                <div>• LLM applied <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>{summary.lintActions}</span> lint improvements</div>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex gap-2 mt-5">
              <a
                href="/api/tree/artifacts/_insights.md"
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center py-2.5 rounded-[10px] text-[12px]"
                style={{ border: '1px solid var(--border-strong)', color: 'var(--text-default)' }}
              >View Report</a>
              <a
                href="/api/graph/html"
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center py-2.5 rounded-[10px] text-[12px]"
                style={{ border: '1px solid var(--border-strong)', color: 'var(--text-default)' }}
              >Open Graph</a>
            </div>
            <button
              onClick={run}
              className="py-2.5 rounded-[10px] text-[12px] font-semibold mt-2"
              style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--text-inverse)' }}
            >Run Again</button>
          </>
        )}
      </div>
    </div>
  );
}
