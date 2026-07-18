import type { Gap } from '@mindbase/core';
import { Lightbulb } from 'lucide-react';

interface Props {
  gap: Gap;
}

export function GapCard({ gap }: Props) {
  return (
    <div
      className="rounded-lg p-3 my-2"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-start gap-2">
        <Lightbulb size={14} strokeWidth={1.8} style={{ color: 'var(--accent-amber)' }} className="shrink-0 mt-0.5" />
        <div>
          <div className="text-xs" style={{ color: 'var(--text-high)' }}>{gap.suggestion}</div>
          {gap.related_notes.length > 0 && (
            <div className="text-[10px] mt-1" style={{ color: 'var(--text-low)' }}>
              Related: {gap.related_notes.join(', ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
