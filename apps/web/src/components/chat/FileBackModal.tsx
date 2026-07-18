// apps/web/src/components/chat/FileBackModal.tsx
//
// Preview-and-approve modal for filing a chat answer back to the wiki as a
// note. Lighter than IngestApprovalModal because the user already read the
// answer — no takeaways or per-action approval is needed; just confirm the
// title, citations, and body.
import { useEffect, useRef, useState } from 'react';
import { X, FileText, Loader2, Check } from 'lucide-react';

interface ProposedAction {
  id: string;
  call: { name: string; arguments: Record<string, unknown> };
}

interface PlanResponse {
  planId: string;
  plan: {
    takeaways: string;
    proposed: ProposedAction[];
  };
}

interface ExecuteResponse {
  results: Array<{ id: string; ok: boolean; slug?: string; error?: string }>;
  summary: { created_slug?: string; actions_run: number; actions_failed: number };
}

interface Props {
  open: boolean;
  question: string;
  answer: string;
  sourceSlugs: string[];
  onClose: () => void;
  onSaved: (slug: string) => void;
}

export function FileBackModal({ open, question, answer, sourceSlugs, onClose, onSaved }: Props) {
  const [title, setTitle] = useState<string>(question);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'loading' | 'review' | 'saving' | 'done' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(question);
    setPlan(null);
    setRejected(new Set());
    setPhase('loading');
    setError(null);
    setSavedSlug(null);
    const ctl = new AbortController();
    abortRef.current = ctl;
    void runPlan(ctl.signal, question);
    return () => { ctl.abort(); abortRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, question, answer]);

  async function runPlan(signal: AbortSignal, titleOverride: string): Promise<void> {
    try {
      const r = await fetch('/api/answer/file-back/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, answer, sourceSlugs, titleOverride }),
        signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as PlanResponse;
      setPlan(data);
      setPhase('review');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
      setPhase('error');
    }
  }

  function toggle(actionId: string): void {
    setRejected((s) => {
      const next = new Set(s);
      if (next.has(actionId)) next.delete(actionId);
      else next.add(actionId);
      return next;
    });
  }

  async function commitSave(): Promise<void> {
    if (!plan) return;
    // Re-plan if user edited the title.
    if (title.trim() !== question) {
      setPhase('loading');
      await runPlan(new AbortController().signal, title.trim());
      return;
    }
    setPhase('saving');
    try {
      const approvals: Record<string, boolean> = {};
      for (const id of rejected) approvals[id] = false;
      const r = await fetch(`/api/answer/file-back/execute/${encodeURIComponent(plan.planId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvals }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as ExecuteResponse;
      const slug = data.summary.created_slug;
      if (!slug) throw new Error('execute returned no slug');
      setSavedSlug(slug);
      setPhase('done');
      onSaved(slug);
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  }

  if (!open) return null;

  const createAction = plan?.plan.proposed.find((p) => p.call.name === 'create_note');
  const linkActions = (plan?.plan.proposed ?? []).filter((p) => p.call.name === 'link');
  const previewBody = (createAction?.call.arguments['content'] as string | undefined) ?? '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget && phase !== 'saving') onClose(); }}
      data-testid="file-back-modal"
    >
      <div
        className="w-[640px] max-h-[85vh] flex flex-col rounded-lg"
        style={{ background: 'var(--win-bg)', border: '0.5px solid var(--hairline)', boxShadow: '0 24px 64px rgba(0,0,0,0.30)' }}
      >
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '0.5px solid var(--hairline)' }}>
          <FileText size={14} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
          <span className="text-[13px] font-medium" style={{ color: 'var(--text-high)' }}>
            {phase === 'loading' && 'Preparing…'}
            {phase === 'review' && 'File answer back as note'}
            {phase === 'saving' && 'Saving…'}
            {phase === 'done' && 'Filed back'}
            {phase === 'error' && 'Error'}
          </span>
          <button onClick={onClose} className="ml-auto p-1 cursor-pointer" style={{ color: 'var(--text-mid)' }}>
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {phase === 'loading' && (
            <div className="text-[12px] flex items-center gap-2" style={{ color: 'var(--text-mid)' }}>
              <Loader2 size={14} className="animate-spin" /> Drafting the note…
            </div>
          )}

          {(phase === 'review' || phase === 'saving' || phase === 'done') && plan && (
            <>
              <div>
                <label className="block text-[10.5px] uppercase tracking-[1.5px] font-semibold mb-1.5"
                       style={{ color: 'var(--text-mid)' }}>
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={phase !== 'review'}
                  className="w-full px-2 py-1.5 rounded text-[13px] outline-none"
                  style={{
                    background: 'var(--bg-2)',
                    border: '0.5px solid var(--hairline)',
                    color: 'var(--text-high)',
                  }}
                />
              </div>

              {sourceSlugs.length > 0 && (
                <div>
                  <div className="text-[10.5px] uppercase tracking-[1.5px] font-semibold mb-1.5"
                       style={{ color: 'var(--text-mid)' }}>
                    Cites ({sourceSlugs.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {sourceSlugs.map((s) => (
                      <span key={s} className="text-[11px] px-1.5 py-0.5 rounded font-mono"
                            style={{ background: 'var(--bg-3)', color: 'var(--text-default)' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {linkActions.length > 0 && (
                <div>
                  <div className="text-[10.5px] uppercase tracking-[1.5px] font-semibold mb-1.5"
                       style={{ color: 'var(--text-mid)' }}>
                    Back-links proposed
                  </div>
                  <div className="space-y-1">
                    {linkActions.map((a) => {
                      const args = a.call.arguments as Record<string, unknown>;
                      const off = rejected.has(a.id);
                      return (
                        <label key={a.id} className="flex items-center gap-2 text-[11.5px] cursor-pointer"
                               style={{ color: off ? 'var(--text-mid)' : 'var(--text-default)', opacity: off ? 0.55 : 1 }}>
                          <input type="checkbox" checked={!off} onChange={() => toggle(a.id)} disabled={phase !== 'review'} />
                          <span className="font-mono">{String(args['from'])}</span>
                          <span style={{ color: 'var(--text-mid)' }}>—{String(args['type'])}→</span>
                          <span className="font-mono">{savedSlug ?? '<new note>'}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10.5px] uppercase tracking-[1.5px] font-semibold mb-1.5"
                     style={{ color: 'var(--text-mid)' }}>
                  Preview
                </div>
                <div
                  className="p-2 rounded text-[11.5px] font-mono whitespace-pre-wrap max-h-[160px] overflow-y-auto"
                  style={{
                    background: 'var(--bg-2)',
                    border: '0.5px solid var(--hairline)',
                    color: 'var(--text-default)',
                  }}
                >
                  {previewBody}
                </div>
              </div>

              {phase === 'done' && savedSlug && (
                <div className="flex items-center gap-2 text-[12px] mt-2" style={{ color: 'var(--accent)' }}>
                  <Check size={14} /> Saved to <code>wiki/notes/{savedSlug}.md</code>
                </div>
              )}
            </>
          )}

          {phase === 'error' && error && (
            <div className="text-[12px]" style={{ color: 'var(--error)' }}>{error}</div>
          )}
        </div>

        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: '0.5px solid var(--hairline)' }}>
          {phase === 'review' && (
            <>
              <button
                onClick={onClose}
                className="text-[12px] px-3 py-1.5 rounded cursor-pointer"
                style={{ color: 'var(--text-mid)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => void commitSave()}
                className="text-[12px] px-3 py-1.5 rounded cursor-pointer inline-flex items-center gap-1.5"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                <Check size={13} /> Save to wiki
              </button>
            </>
          )}
          {phase === 'saving' && (
            <span className="text-[12px] inline-flex items-center gap-1.5" style={{ color: 'var(--text-mid)' }}>
              <Loader2 size={13} className="animate-spin" /> Writing…
            </span>
          )}
          {phase === 'done' && (
            <button
              onClick={onClose}
              className="text-[12px] px-3 py-1.5 rounded cursor-pointer"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
