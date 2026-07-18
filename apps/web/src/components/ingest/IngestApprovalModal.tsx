// apps/web/src/components/ingest/IngestApprovalModal.tsx
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';
import type { ProposedAction, ApprovalMap } from '@mindbase/core';

interface Props {
  rawId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

type Phase = 'planning' | 'discussing' | 'reviewing' | 'executing' | 'done' | 'error';

async function* parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const chunks = buf.split('\n\n');
    buf = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      const evLine = lines.find((l) => l.startsWith('event: '));
      const dataLine = lines.find((l) => l.startsWith('data: '));
      if (!evLine || !dataLine) continue;
      yield {
        event: evLine.slice('event: '.length),
        data: JSON.parse(dataLine.slice('data: '.length)) as Record<string, unknown>,
      };
    }
  }
}

export function IngestApprovalModal({ rawId, open, onClose, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('planning');
  const [takeaways, setTakeaways] = useState<string>('');
  const [proposed, setProposed] = useState<ProposedAction[]>([]);
  const [approvals, setApprovals] = useState<ApprovalMap>({});
  const [planId, setPlanId] = useState<string | null>(null);
  const [execResults, setExecResults] = useState<Array<{ id: string; ok: boolean; error?: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase('planning');
    setTakeaways('');
    setProposed([]);
    setApprovals({});
    setExecResults([]);
    setError(null);
    const ctl = new AbortController();
    abortRef.current = ctl;
    void runPlan(ctl.signal);
    return () => { ctl.abort(); abortRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rawId]);

  // Fix 3: ESC key closes modal except during executing
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && phase !== 'executing') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, phase, onClose]);

  async function runPlan(signal: AbortSignal): Promise<void> {
    try {
      const resp = await fetch(`/api/compile/${encodeURIComponent(rawId)}/plan`, { method: 'POST', signal });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      for await (const { event, data } of parseSSE(resp.body.getReader())) {
        if (signal.aborted) return;
        if (event === 'takeaways') {
          // Conversational opening — LLM's narrative arrives before the
          // structured actions. Show it as a distinct discussion phase.
          setTakeaways(data['text'] as string);
          setPhase('discussing');
        } else if (event === 'proposed') {
          setProposed((p) => [...p, data['action'] as ProposedAction]);
        } else if (event === 'done') {
          setPlanId(data['planId'] as string);
          setPhase('reviewing');
        } else if (event === 'error') {
          setError(data['error'] as string);
          setPhase('error');
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
      setPhase('error');
    }
  }

  function toggleApproval(id: string): void {
    setApprovals((a) => ({ ...a, [id]: a[id] === false ? true : false }));
  }

  function approveAll(): void { setApprovals({}); }   // empty = all approved (default)
  function rejectAll(): void { setApprovals(Object.fromEntries(proposed.map((p) => [p.id, false]))); }

  async function runExecute(): Promise<void> {
    if (!planId) return;
    const ctl = new AbortController();
    abortRef.current = ctl;
    setPhase('executing');
    try {
      const resp = await fetch(`/api/compile/execute/${encodeURIComponent(planId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvals }),
        signal: ctl.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      for await (const { event, data } of parseSSE(resp.body.getReader())) {
        if (ctl.signal.aborted) return;
        if (event === 'exec') {
          const action = data['action'] as { id: string };
          const result = data['result'] as { ok: boolean; error?: string };
          setExecResults((r) => [...r, { id: action.id, ok: result.ok, error: result.error }]);
        } else if (event === 'done') {
          setPhase('done');
          onDone();
        } else if (event === 'error') {
          setError(data['error'] as string);
          setPhase('error');
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
      setPhase('error');
    }
  }

  if (!open) return null;

  return (
    // Fix 4: backdrop click closes modal except during executing
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', paddingTop: 60 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== 'executing') onClose();
      }}
    >
      <div
        className="w-[640px] max-h-[85vh] flex flex-col rounded-lg"
        style={{ background: 'var(--win-bg)', border: '0.5px solid var(--hairline)', boxShadow: '0 24px 64px rgba(0,0,0,0.30)' }}
        data-testid="ingest-approval-modal"
      >
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '0.5px solid var(--hairline)' }}>
          <Sparkles size={14} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
          <span className="text-[13px] font-medium" style={{ color: 'var(--text-high)' }}>
            {phase === 'planning' && 'Reading the source…'}
            {phase === 'discussing' && 'Takeaways — review before approving plan'}
            {phase === 'reviewing' && `Plan: ${proposed.length} action${proposed.length === 1 ? '' : 's'}`}
            {phase === 'executing' && 'Applying changes…'}
            {phase === 'done' && 'Done'}
            {phase === 'error' && 'Error'}
          </span>
          <button onClick={onClose} className="ml-auto p-1 cursor-pointer" style={{ color: 'var(--text-mid)' }}>
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {phase === 'planning' && (
            <div className="text-[12px] flex items-center gap-2" style={{ color: 'var(--text-mid)' }}>
              <Loader2 size={14} className="animate-spin" /> Reading the source…
            </div>
          )}
          {(phase === 'discussing' || phase === 'reviewing' || phase === 'executing' || phase === 'done') && takeaways && (
            <div
              className="mb-4 p-3 rounded text-[12.5px] leading-[1.6] whitespace-pre-wrap"
              style={{
                background: 'var(--bg-2)',
                border: '0.5px solid var(--hairline)',
                color: 'var(--text-default)',
              }}
              data-testid="ingest-takeaways"
            >
              {takeaways}
            </div>
          )}
          {phase === 'discussing' && (
            <div className="text-[12px] flex items-center gap-2" style={{ color: 'var(--text-mid)' }}>
              <Loader2 size={14} className="animate-spin" /> Drafting the action plan from these takeaways…
            </div>
          )}
          {(phase === 'reviewing' || phase === 'executing' || phase === 'done') && (
            <div className="space-y-2">
              {proposed.map((action) => {
                const approved = approvals[action.id] !== false;
                const execResult = execResults.find((r) => r.id === action.id);
                const args = action.call.arguments as Record<string, unknown>;
                const title =
                  (args['name'] as string) ??
                  (args['concept_name'] as string) ??
                  (args['from'] as string) ??
                  '?';
                return (
                  <div
                    key={action.id}
                    className="flex items-start gap-3 p-2 rounded"
                    style={{ background: approved ? 'transparent' : 'var(--bg-2)', opacity: approved ? 1 : 0.55 }}
                  >
                    {phase === 'reviewing' ? (
                      <input
                        type="checkbox"
                        checked={approved}
                        onChange={() => toggleApproval(action.id)}
                        className="mt-1 cursor-pointer"
                      />
                    ) : execResult ? (
                      execResult.ok
                        ? <Check size={14} style={{ color: 'var(--accent)' }} />
                        : <X size={14} style={{ color: 'var(--error)' }} />
                    ) : phase === 'executing' ? (
                      <Loader2 size={12} className="animate-spin mt-1" style={{ color: 'var(--text-mid)' }} />
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px]" style={{ color: 'var(--text-high)' }}>
                        <span className="font-mono text-[11px]" style={{ color: 'var(--text-mid)' }}>
                          {action.call.name}
                        </span>
                        {' '}
                        {title}
                      </div>
                      {execResult?.error && (
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--error)' }}>
                          {execResult.error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {proposed.length === 0 && phase === 'reviewing' && (
                <div className="text-[12px] py-4 text-center" style={{ color: 'var(--text-mid)' }}>
                  No actions to take — the LLM didn&apos;t extract anything.
                </div>
              )}
            </div>
          )}
          {phase === 'error' && error && (
            <div className="text-[12px] p-3 rounded" style={{ color: 'var(--error)', background: 'var(--bg-2)' }}>
              {error}
            </div>
          )}
        </div>

        {phase === 'reviewing' && proposed.length > 0 && (
          <div className="px-5 py-3 flex items-center gap-2" style={{ borderTop: '0.5px solid var(--hairline)' }}>
            <button onClick={approveAll} className="text-[11px] px-2 py-1 cursor-pointer" style={{ color: 'var(--text-mid)' }}>
              Approve all
            </button>
            <button onClick={rejectAll} className="text-[11px] px-2 py-1 cursor-pointer" style={{ color: 'var(--text-mid)' }}>
              Reject all
            </button>
            <div className="ml-auto" />
            <button
              onClick={() => void runExecute()}
              className="text-[12px] px-3 py-1.5 rounded cursor-pointer"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              Apply approved
            </button>
          </div>
        )}
        {phase === 'done' && (
          <div className="px-5 py-3 flex justify-end" style={{ borderTop: '0.5px solid var(--hairline)' }}>
            <button
              onClick={onClose}
              className="text-[12px] px-3 py-1.5 rounded cursor-pointer"
              style={{ background: 'var(--accent-soft, var(--bg-2))', color: 'var(--accent)' }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
