import { useEffect, useState } from 'react';
import type { WikiFileSummary } from '@mindbase/core';

const KIND_LABELS: Record<string, string> = {
  all: 'All',
  concept: 'Concepts',
  note: 'Notes',
  daily: 'Daily',
  meeting: 'Meetings',
  person: 'People',
  project: 'Projects',
};

const ORDER = ['all', 'note', 'daily', 'concept', 'meeting', 'person', 'project'];

const STORAGE_KEY = 'mindbase.kindFilter';

interface Props {
  files: WikiFileSummary[];
  value: string;
  onChange: (kind: string) => void;
}

export function KindFilterChips({ files, value, onChange }: Props) {
  const counts: Record<string, number> = { all: files.length };
  for (const f of files) {
    const k = f.kind ?? 'concept';
    counts[k] = (counts[k] ?? 0) + 1;
  }

  // Show only chips with non-zero counts (besides 'all')
  const visible = ORDER.filter((k) => k === 'all' || (counts[k] ?? 0) > 0);

  return (
    <div className="flex gap-1 px-3 pb-2 overflow-x-auto" data-testid="kind-chips">
      {visible.map((k) => {
        const active = value === k;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            className="focus-ring text-xs px-2 py-0.5 rounded-full whitespace-nowrap transition-base"
            style={{
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-fg)' : 'var(--text-secondary)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
            }}
            onMouseEnter={(e) => {
              if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            {KIND_LABELS[k] ?? k}{k !== 'all' && counts[k] ? ` · ${counts[k]}` : ''}
          </button>
        );
      })}
    </div>
  );
}

export function useKindFilter(): [string, (k: string) => void] {
  const [value, setValue] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? 'all'; } catch { return 'all'; }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* ignore */ }
  }, [value]);
  return [value, setValue];
}
