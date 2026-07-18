import { Rss } from 'lucide-react';

export function StreamView() {
  return (
    <div
      data-testid="stream-view"
      className="flex flex-col items-center justify-center h-full text-center px-6"
      style={{ color: 'var(--text-mid)' }}
    >
      <Rss size={28} strokeWidth={1.4} style={{ color: 'var(--text-faint)' }} />
      <div className="mt-3 text-base font-semibold" style={{ color: 'var(--text-high)' }}>
        Stream
      </div>
      <div className="mt-1 text-sm" style={{ color: 'var(--text-mid)' }}>
        A continuous feed of new activity in your knowledge base.
      </div>
      <div className="mt-2 text-xs" style={{ color: 'var(--text-faint)' }}>
        Coming soon.
      </div>
    </div>
  );
}
