// apps/web/src/components/WikiHome.tsx
//
// Wiki v2 home — renders context.md (the LLM-compiled project overview) as the
// main canvas, with a Rebuild button to signal /mb:build should re-run.
// context.md is the v2 replacement for INDEX.md — see docs/pivot-plan-*.md.
//
// If context.md is missing (fresh project), we show an empty-state pointing
// at /mb:build in Claude Code.
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { apiGet, apiPost } from '../lib/api';
import { showToast } from '../store/toast';

interface ContextResponse {
  category: string;
  body: string | null;
}

export function WikiHome() {
  const [contextBody, setContextBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<ContextResponse>('/tree/context');
        setContextBody(r.body);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [lastRefreshed]);

  const rebuild = async () => {
    setRebuilding(true);
    try {
      await apiPost('/compile/build', {});
      showToast('Rebuild triggered — run /mb:build in Claude Code to complete');
      setTimeout(() => setLastRefreshed(Date.now()), 500);
    } catch (e) {
      showToast(`Rebuild failed: ${(e as Error).message}`, 'error');
    } finally {
      setRebuilding(false);
    }
  };

  if (error) {
    return (
      <div style={{ padding: 24 }} data-testid="wiki-home">
        <h1 style={{ color: 'var(--error)' }}>Failed to load context</h1>
        <p style={{ color: 'var(--text-mid)' }}>{error}</p>
        <p style={{ color: 'var(--text-faint)', fontSize: 12 }}>
          Is the current project a v2 v2-layout project?
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="wiki-home">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '0.5px solid var(--hairline)',
          background: 'var(--bg)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18, color: 'var(--text-high)' }}>Project Context</h1>
        <button
          onClick={rebuild}
          disabled={rebuilding}
          data-testid="wiki-home-rebuild"
          style={{
            padding: '6px 14px',
            background: 'var(--accent, #4a4a8a)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: rebuilding ? 'wait' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {rebuilding ? 'Triggering…' : '↻ Rebuild'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[760px] mx-auto px-6 py-8">
          {contextBody === null ? (
            <div style={{ color: 'var(--text-mid)', fontStyle: 'italic', fontSize: 13 }}>
              No context.md yet. Run /mb:build in Claude Code after your first contribution.
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none"
              style={{
                ['--tw-prose-body' as never]: 'var(--text-default)',
                ['--tw-prose-headings' as never]: 'var(--text-high)',
                ['--tw-prose-links' as never]: 'var(--accent, #5e76f0)',
                ['--tw-prose-bold' as never]: 'var(--text-high)',
                ['--tw-prose-hr' as never]: 'var(--hairline)',
                fontSize: '13px',
                lineHeight: 1.65,
              } as React.CSSProperties}
            >
              <ReactMarkdown>{contextBody}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
