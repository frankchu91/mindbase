import type { Contradiction } from '@mindbase/core';
import { AlertTriangle } from 'lucide-react';

interface Props {
  contradiction: Contradiction;
  onReconcile?: () => void;
  onDismiss?: () => void;
}

export function ContradictionCard({ contradiction, onReconcile, onDismiss }: Props) {
  return (
    <div
      className="rounded-lg p-3 my-2"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
    >
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle size={14} strokeWidth={1.8} style={{ color: 'var(--accent-amber)' }} className="shrink-0 mt-0.5" />
        <div className="text-xs font-medium" style={{ color: 'var(--text-high)' }}>
          Contradiction with <span style={{ color: 'var(--accent-azure)' }}>{contradiction.with_slug}</span>
        </div>
      </div>
      <div className="text-[11px] mb-1" style={{ color: 'var(--text-mid)' }}>
        <span style={{ fontWeight: 600 }}>You said:</span> "{contradiction.your_claim_excerpt}"
      </div>
      <div className="text-[11px] mb-2" style={{ color: 'var(--text-mid)' }}>
        <span style={{ fontWeight: 600 }}>But also:</span> "{contradiction.conflicting_claim_excerpt}"
      </div>
      {contradiction.explanation && (
        <div className="text-[10px] italic mb-2" style={{ color: 'var(--text-low)' }}>
          {contradiction.explanation}
        </div>
      )}
      <div className="flex gap-2 mt-2">
        {onReconcile && (
          <button
            onClick={onReconcile}
            className="text-[11px] px-2 py-1 rounded transition-base"
            style={{ color: 'var(--accent-azure)', background: 'transparent', border: '1px solid var(--border-default)' }}
          >
            Reconcile →
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-[11px] px-2 py-1 rounded transition-base"
            style={{ color: 'var(--text-low)' }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
