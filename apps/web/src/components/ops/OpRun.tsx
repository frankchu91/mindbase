import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Check, X, AlertTriangle, Hammer, Sparkles } from 'lucide-react';
import { apiSSE } from '../../lib/api';
import { useSettings } from '../../store/settings';
import {
  type OpAction, type OpEvent, type OpName,
  actionTarget, actionPreview, ACTION_BADGE,
} from './ops-types';

interface OpRunProps {
  op: OpName;
  /** Initial argument for contribute; empty string opens the inline input. */
  initialText?: string;
  onOpenArticle: (slug: string, path: string) => void;
  onClose: () => void;
  /** Fires once when the op finishes applying (files were written). */
  onDone?: () => void;
}

interface PlanState {
  planId: string;
  takeaways: string[];
  plan: OpAction[];
  checked: boolean[];
}

type Stage = 'input' | 'running' | 'awaiting-approval' | 'applying' | 'done' | 'error';

export function OpRun({ op, initialText = '', onOpenArticle, onClose, onDone }: OpRunProps) {
  const provider = useSettings((s) => s.provider);
  const model = useSettings((s) => s.model);
  const [stage, setStage] = useState<Stage>(op === 'contribute' && !initialText ? 'input' : 'running');
  const [text, setText] = useState(initialText);
  const [phase, setPhase] = useState('starting');
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [failed, setFailed] = useState<Array<{ action: string; error: string }>>([]);
  const [error, setError] = useState('');
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRef.current?.(), []);

  const handleEvent = useCallback((ev: OpEvent) => {
    if (ev.kind === 'phase') setPhase(ev.phase);
    else if (ev.kind === 'plan') {
      setPlan({ planId: ev.planId, takeaways: ev.takeaways, plan: ev.plan, checked: ev.plan.map(() => true) });
      setStage('awaiting-approval');
    } else if (ev.kind === 'applied') {
      setApplied(ev.applied);
      setFailed(ev.failed);
      setStage('done');
      onDone?.();
    } else if (ev.kind === 'error') {
      setError(ev.error);
      setStage('error');
    } else if (ev.kind === 'done' && op === 'build') {
      setStage('done');
    }
  }, [op, onDone]);

  const start = useCallback((argText: string) => {
    setStage('running');
    setPhase('starting');
    setError('');
    const body = op === 'build' ? {} : { mode: 'plan', text: argText };
    const path = op === 'build' ? '/ops/build' : '/ops/contribute';
    cancelRef.current = apiSSE<OpEvent>(path, body, handleEvent).cancel;
  }, [op, handleEvent]);

  // Auto-start when we arrived with an argument (or it's a build).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (op === 'build' || initialText) {
      autoStarted.current = true;
      start(initialText);
    }
  }, [op, initialText, start]);

  function apply() {
    if (!plan) return;
    const selected = plan.checked.flatMap((on, i) => (on ? [i] : []));
    setStage('applying');
    cancelRef.current = apiSSE<OpEvent>('/ops/contribute', { mode: 'apply', planId: plan.planId, selected }, handleEvent).cancel;
  }

  function toggle(i: number) {
    if (!plan) return;
    setPlan({ ...plan, checked: plan.checked.map((on, j) => (j === i ? !on : on)) });
  }

  function openPath(path: string) {
    // Applied paths are project-root-relative; map them to the tree API's
    // (category, path-within-category) shape that onOpenArticle expects.
    if (path === 'context.md') return onOpenArticle('context', 'context.md');
    const m = path.match(/^(?:sources\/)?(research|contributors|raw|logs|artifacts)\/(.+)$/);
    if (m) return onOpenArticle(m[1]!, m[2]!);
    const slug = (path.split('/').pop() ?? path).replace(/\.md$/, '');
    onOpenArticle(slug, path);
  }

  const selectedCount = plan?.checked.filter(Boolean).length ?? 0;
  const Icon = op === 'build' ? Hammer : Sparkles;

  return (
    <div
      className="mb-4 overflow-hidden"
      style={{ border: '0.5px solid var(--hairline)', borderRadius: 12, background: 'var(--bg-2)' }}
      data-testid={`op-run-${op}`}
    >
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '0.5px solid var(--hairline-soft)' }}>
        <Icon size={13} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-default)' }}>
          {op === 'build' ? 'Rebuild context' : 'Contribute to wiki'}
        </span>
        <button
          onClick={onClose}
          className="ml-auto w-5 h-5 flex items-center justify-center rounded cursor-pointer"
          style={{ color: 'var(--text-faint)' }}
          title="Dismiss"
          data-testid="op-close"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      <div className="px-3 py-2.5">
        {stage === 'input' && (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What should I process? Paste a thought, decision, or source…"
              rows={3}
              className="resize-none outline-none w-full px-2.5 py-2"
              style={{
                fontSize: 13, color: 'var(--text-default)', background: 'var(--input-bg)',
                border: '0.5px solid var(--hairline)', borderRadius: 8, lineHeight: '19px',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) start(text.trim());
              }}
              data-testid="op-contribute-input"
            />
            <div className="flex justify-end">
              <PrimaryBtn disabled={!text.trim()} onClick={() => start(text.trim())} testId="op-contribute-start">
                Process
              </PrimaryBtn>
            </div>
          </div>
        )}

        {(stage === 'running' || stage === 'applying') && (
          <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>
            <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span data-testid="op-phase">{phase}…</span>
          </div>
        )}

        {stage === 'awaiting-approval' && plan && (
          <div className="flex flex-col gap-2.5">
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Takeaways
              </div>
              <ul className="mt-1 flex flex-col gap-0.5" style={{ fontSize: 12.5, color: 'var(--text-default)', lineHeight: '18px' }}>
                {plan.takeaways.map((t, i) => <li key={i} className="flex gap-1.5"><span style={{ color: 'var(--accent)' }}>•</span><span>{t}</span></li>)}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Proposed updates
              </div>
              <div className="mt-1 flex flex-col gap-1">
                {plan.plan.map((a, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2 px-2 py-1.5 cursor-pointer rounded-md"
                    style={{ background: 'var(--input-bg)', border: '0.5px solid var(--hairline-soft)', opacity: plan.checked[i] ? 1 : 0.5 }}
                    data-testid={`op-action-${i}`}
                  >
                    <input type="checkbox" checked={plan.checked[i]} onChange={() => toggle(i)} className="mt-0.5" />
                    <span className="flex-1 min-w-0" style={{ fontSize: 12, lineHeight: '17px' }}>
                      <span
                        className="inline-block px-1.5 mr-1.5 rounded"
                        style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg-2)', color: 'var(--accent)', border: '0.5px solid var(--hairline)' }}
                      >
                        {ACTION_BADGE[a.kind]}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-default)' }}>{actionTarget(a)}</span>
                      <span style={{ color: 'var(--text-mid)' }}> — {actionPreview(a)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-2.5 py-1 rounded-md cursor-pointer"
                style={{ fontSize: 12, color: 'var(--text-mid)' }}
                data-testid="op-cancel"
              >
                Cancel
              </button>
              <PrimaryBtn disabled={selectedCount === 0} onClick={apply} testId="op-apply">
                Apply ({selectedCount})
              </PrimaryBtn>
            </div>
          </div>
        )}

        {stage === 'done' && (
          <div className="flex flex-col gap-1.5" data-testid="op-done">
            <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: 'var(--text-default)', fontWeight: 600 }}>
              <Check size={13} strokeWidth={2.2} style={{ color: 'var(--success, #34a853)' }} />
              {applied.length > 0 ? `Updated ${applied.length} file${applied.length === 1 ? '' : 's'}` : 'Done'}
            </div>
            {applied.map((p) => (
              <button
                key={p}
                onClick={() => openPath(p)}
                className="text-left cursor-pointer"
                style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'ui-monospace, monospace' }}
                data-testid="op-applied-file"
              >
                {p}
              </button>
            ))}
            {failed.map((f, i) => (
              <div key={i} className="flex items-start gap-1.5" style={{ fontSize: 11.5, color: 'var(--text-mid)' }}>
                <AlertTriangle size={12} style={{ color: '#e8a13c', marginTop: 2 }} />
                <span>{f.action}: {f.error}</span>
              </div>
            ))}
            {provider === 'ollama' && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                Ran on {model} locally — deeper synthesis available with a cloud model (Settings).
              </div>
            )}
          </div>
        )}

        {stage === 'error' && (
          <div className="flex flex-col gap-2" data-testid="op-error">
            <div className="flex items-start gap-1.5" style={{ fontSize: 12.5, color: 'var(--text-default)' }}>
              <AlertTriangle size={13} style={{ color: '#e8a13c', marginTop: 2 }} />
              <span className="whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>{error}</span>
            </div>
            <div className="flex justify-end">
              <PrimaryBtn onClick={() => (op === 'contribute' && !text ? setStage('input') : start(text.trim()))} testId="op-retry">
                Retry
              </PrimaryBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrimaryBtn({ onClick, disabled, children, testId }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode; testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1 rounded-md"
      style={{
        fontSize: 12, fontWeight: 600, background: 'var(--accent)', color: 'white',
        opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer',
      }}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
