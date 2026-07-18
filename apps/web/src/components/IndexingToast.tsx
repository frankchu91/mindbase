import { useEffect, useRef, useState } from 'react';

interface IndexStatus {
  indexed: number;
  total: number;
  current?: string;
}

const DISMISS_KEY = 'mindbase.indexingToast.dismissedAt';
const DISMISS_TTL_MS = 6 * 60 * 60 * 1000; // re-show after 6h even if user dismissed

/**
 * Floating bottom-right toast that surfaces the embedding indexer's progress
 * on first boot. Polls /api/search/index-status every 2s; auto-hides when
 * indexing is complete (indexed === total && total > 0). A small × button
 * lets the user dismiss mid-run; dismissal lasts 6h to avoid annoyance.
 */
export function IndexingToast() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < DISMISS_TTL_MS;
  });
  const lastTotal = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const r = await fetch('/api/search/index-status');
        if (!r.ok || cancelled) return;
        const data = (await r.json()) as IndexStatus;
        if (cancelled) return;
        setStatus(data);
        // If a new indexing job started (total grew after we'd seen zero),
        // un-dismiss so the toast re-appears.
        if (data.total > lastTotal.current && data.indexed < data.total) {
          setDismissed(false);
          localStorage.removeItem(DISMISS_KEY);
        }
        lastTotal.current = data.total;
      } catch {
        /* server gone — ignore */
      }
    }

    poll(); // immediate
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }

  // Hide conditions:
  if (!status) return null; // not loaded yet
  if (dismissed) return null;
  if (status.total === 0) return null; // nothing to do
  if (status.indexed >= status.total) return null; // complete

  const pct = status.total > 0 ? Math.round((status.indexed / status.total) * 100) : 0;
  const isFirstRun = status.indexed === 0 && status.total > 0;

  return (
    <div
      className="fixed z-40 rounded-lg shadow-xl"
      style={{
        bottom: 16,
        right: 16,
        width: 320,
        background: 'var(--surface-elevated, #1a1d24)',
        border: '1px solid var(--border, rgba(255,255,255,0.12))',
        padding: '12px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#60a5fa',
              boxShadow: '0 0 8px rgba(96,165,250,0.6)',
              animation: 'pulse 1.4s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-high, #fff)' }}>
            {isFirstRun ? 'Preparing search index…' : 'Indexing for search'}
          </span>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted, #9ca3af)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)', marginBottom: 8 }}>
        {status.indexed} of {status.total} pages
        {status.current && (
          <>
            {' · '}
            <span style={{ fontStyle: 'italic' }}>{truncate(status.current, 28)}</span>
          </>
        )}
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 4,
          width: '100%',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #60a5fa, #818cf8)',
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      {isFirstRun && (
        <div style={{ fontSize: 10, color: 'var(--text-low, #6b7280)', marginTop: 8, lineHeight: 1.4 }}>
          First-time setup downloading multilingual model (~570 MB). Search works
          in BM25-only mode until this finishes.
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
