import type { Citation } from '@mindbase/core';
import { FileText } from 'lucide-react';

interface Props {
  citation: Citation;
  onOpen: (slug: string) => void;
}

export function CitationChip({ citation, onOpen }: Props) {
  const label = `${citation.slug}:${citation.line_range[0]}${citation.line_range[1] !== citation.line_range[0] ? `-${citation.line_range[1]}` : ''}`;
  return (
    <button
      onClick={() => onOpen(citation.slug)}
      className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded text-[11px] font-mono transition-base"
      style={{
        background: 'var(--surface-2)',
        color: 'var(--accent-azure)',
        border: '1px solid var(--border-subtle)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
      title={`Open ${citation.slug}`}
    >
      <FileText size={10} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
}
