import { X, PenLine } from 'lucide-react';
import { FINDING_COLOR, FINDING_LABEL, type Finding } from './ops-types';

interface FindingCardProps {
  finding: Finding;
  onOpenPage: (path: string) => void;
  /** Omit to hide the per-card actions (compact chat rendering). */
  onDismiss?: (id: string) => void;
  onFollowUp?: (finding: Finding) => void;
}

export function FindingCard({ finding, onOpenPage, onDismiss, onFollowUp }: FindingCardProps) {
  const color = FINDING_COLOR[finding.kind];
  return (
    <div
      className="px-3 py-2.5 rounded-lg"
      style={{
        background: 'var(--input-bg)',
        border: '0.5px solid var(--hairline)',
        borderLeft: `3px solid ${color}`,
        opacity: finding.dismissed ? 0.45 : 1,
      }}
      data-testid={`finding-${finding.kind}`}
    >
      <div className="flex items-center gap-2">
        <span
          className="px-1.5 rounded"
          style={{ fontSize: 10, fontWeight: 700, color, border: `0.5px solid ${color}44`, textTransform: 'uppercase', letterSpacing: '0.04em' }}
        >
          {FINDING_LABEL[finding.kind]}
        </span>
        <span className="flex-1" />
        {onFollowUp && !finding.dismissed && (
          <button
            onClick={() => onFollowUp(finding)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer"
            style={{ fontSize: 11, color: 'var(--text-mid)' }}
            title="File a follow-up note into today's contributor entry"
            data-testid="finding-followup"
          >
            <PenLine size={11} strokeWidth={1.8} /> Follow up
          </button>
        )}
        {onDismiss && !finding.dismissed && (
          <button
            onClick={() => onDismiss(finding.id)}
            className="w-5 h-5 flex items-center justify-center rounded cursor-pointer"
            style={{ color: 'var(--text-faint)' }}
            title="Dismiss"
            data-testid="finding-dismiss"
          >
            <X size={11} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="mt-1.5" style={{ fontSize: 12.5, color: 'var(--text-default)', lineHeight: '18px' }}>
        {finding.detail}
      </div>
      {finding.pages.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {finding.pages.map((pg) => (
            <button
              key={pg}
              onClick={() => onOpenPage(pg)}
              className="cursor-pointer text-left"
              style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'ui-monospace, monospace' }}
              data-testid="finding-page"
            >
              {pg}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
