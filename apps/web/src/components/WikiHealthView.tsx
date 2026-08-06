// Wiki Health — runs the server-side lint op (/api/ops/lint) with the
// configured LLM and renders finding cards (contradictions, orphans,
// stale claims, gaps…). Findings are cached server-side in
// artifacts/lint/<date>.json so the view persists across reloads.
import { useEffect, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { apiSSE, apiGet, apiPost } from '../lib/api';
import { showToast } from '../store/toast';
import { FindingCard } from './ops/FindingCard';
import type { Finding, OpEvent } from './ops/ops-types';

interface Props {
  onBack: () => void;
  onWikiChanged: () => void;
  onOpenArticle?: (categoryOrSlug: string, path: string) => void;
}

export function WikiHealthView({ onBack, onWikiChanged, onOpenArticle }: Props) {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the cached artifact so the last run's cards survive reloads.
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiGet<{ date: string | null; findings: Finding[] }>('/ops/lint/latest');
        if (r.date) {
          setDate(r.date);
          setFindings(r.findings);
        }
      } catch { /* fresh project — empty state */ }
    })();
  }, []);

  function run() {
    if (running) return;
    setRunning(true);
    setError(null);
    setPhase('starting');
    apiSSE<OpEvent>('/ops/lint', {}, (event) => {
      if (event.kind === 'phase') setPhase(event.phase);
      else if (event.kind === 'findings') {
        setDate(event.date);
        setFindings(event.findings);
        setRunning(false);
        onWikiChanged();
      } else if (event.kind === 'error') {
        setError(event.error);
        setRunning(false);
      }
    });
  }

  function openPage(path: string) {
    if (!onOpenArticle) return;
    if (path === 'context.md') return onOpenArticle('context', 'context.md');
    const m = path.match(/^(?:sources\/)?(research|contributors|raw|logs|artifacts)\/(.+)$/);
    if (m) return onOpenArticle(m[1]!, m[2]!);
    onOpenArticle((path.split('/').pop() ?? path).replace(/\.md$/, ''), path);
  }

  async function dismiss(id: string) {
    setFindings((f) => f?.map((x) => (x.id === id ? { ...x, dismissed: true } : x)) ?? null);
    try {
      await apiPost('/ops/lint/dismiss', { id });
    } catch (e) {
      showToast(`Dismiss failed: ${(e as Error).message}`, 'error');
    }
  }

  async function followUp(finding: Finding) {
    const text = `Follow-up from wiki health check (${finding.kind}): ${finding.detail}${
      finding.pages.length ? `\nPages: ${finding.pages.join(', ')}` : ''}`;
    try {
      await apiPost('/tree/contributors/daily', { text });
      showToast('Filed to today’s contributor note');
      onWikiChanged();
    } catch (e) {
      showToast(`Follow-up failed: ${(e as Error).message}`, 'error');
    }
  }

  const active = findings?.filter((f) => !f.dismissed) ?? [];
  const dismissed = findings?.filter((f) => f.dismissed) ?? [];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-sidebar)' }}>
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={onBack} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>←</button>
        <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Activity size={14} strokeWidth={1.6} />
          Wiki Health
        </div>
        {date && (
          <span className="ml-auto text-[10.5px]" style={{ color: 'var(--text-low)' }}>last run {date}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3" data-testid="health-view">
        {findings === null && !running && !error && (
          <>
            <div className="hero-mark mb-6 mx-auto"></div>
            <div className="text-[10.5px] tracking-[3px] uppercase font-medium text-center mb-3" style={{ color: 'var(--text-low)' }}>
              Wiki Health
            </div>
            <div className="text-[24px] font-bold text-center leading-[1.1] tracking-[-0.8px] mb-3" style={{ color: 'var(--text-high)' }}>
              Tend to your<br /><span className="accent-italic">knowledge garden.</span>
            </div>
            <div className="text-[12px] text-center leading-[1.55] mb-7" style={{ color: 'var(--text-mid)' }}>
              The AI reads your wiki and surfaces contradictions,<br />orphan pages, stale claims, and open gaps.
            </div>
          </>
        )}

        {running && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-mid)' }} data-testid="health-phase">
            <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent)' }} />
            {phase}…
          </div>
        )}

        {error && (
          <div className="text-xs px-3 py-2 rounded-md whitespace-pre-wrap" style={{ background: 'var(--error-bg, rgba(229,72,77,0.1))', color: 'var(--error, #e5484d)' }} data-testid="health-error">
            {error}
          </div>
        )}

        {findings !== null && !running && (
          <>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-high)' }} data-testid="health-summary">
              {active.length === 0
                ? 'Healthy — nothing needs attention.'
                : `${active.length} finding${active.length === 1 ? '' : 's'} need${active.length === 1 ? 's' : ''} attention`}
            </div>
            {active.map((f) => (
              <FindingCard key={f.id} finding={f} onOpenPage={openPage} onDismiss={dismiss} onFollowUp={followUp} />
            ))}
            {dismissed.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-[1px] font-semibold mb-1.5" style={{ color: 'var(--text-low)' }}>
                  Dismissed ({dismissed.length})
                </div>
                <div className="flex flex-col gap-1.5">
                  {dismissed.map((f) => (
                    <FindingCard key={f.id} finding={f} onOpenPage={openPage} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!running && (
          <button
            onClick={run}
            className="py-2.5 rounded-[10px] text-[12px] font-semibold mt-2"
            style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--text-inverse)' }}
            data-testid="health-run"
          >
            {findings === null ? 'Run Wiki Health Check' : 'Run Again'}
          </button>
        )}
      </div>
    </div>
  );
}
