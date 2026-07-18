import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../lib/api';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import type { ExtraProps } from 'react-markdown';
import type React from 'react';

interface CitedSource {
  n: number;
  slug: string;
  title: string;
  path: string;
  one_liner: string;
}

interface BriefRecord {
  date: string;
  generated_at: string;
  summary: string;
  citations: CitedSource[];
  status?: string;
  message_id?: string;
  inbox_pending?: number;
}

interface Props {
  onOpenArticle?: (slug: string, path: string) => void;
}

function injectCiteElements(text: string): string {
  return text.replace(/\[(\d+)\]/g, (_, n) => `<cite data-n="${n}"></cite>`);
}

export function TodaysBriefCard({ onOpenArticle }: Props) {
  const [brief, setBrief] = useState<BriefRecord | null>(null);
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      const r = await apiGet<{ exists: boolean; brief?: BriefRecord }>('/brief/today');
      setExists(r.exists);
      setBrief(r.brief ?? null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSendNow() {
    setSending(true);
    try {
      await apiPost('/brief/send-now', {});
      showToast('Brief sent!');
      await load();
    } catch (e) {
      showToast(`Failed: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  async function handlePreview() {
    try {
      const r = await apiGet<{ html: string }>('/brief/preview');
      setPreviewHtml(r.html);
    } catch (e) {
      showToast(`Preview failed: ${(e as Error).message}`);
    }
  }

  if (loading) return null;

  const sourceMap = new Map<number, CitedSource>(
    (brief?.citations ?? []).map((s) => [s.n, s]),
  );

  const markdownComponents = {
    cite: ({ node: _node, ...props }: React.HTMLAttributes<HTMLElement> & ExtraProps) => {
      const rawN = (props as React.HTMLAttributes<HTMLElement> & { 'data-n'?: string })['data-n'];
      const n = typeof rawN === 'string' ? parseInt(rawN, 10) : NaN;
      if (isNaN(n)) return null;
      const src = sourceMap.get(n);
      if (!src) return <sup style={{ fontSize: '0.7em' }}>[{n}]</sup>;
      return (
        <button
          onClick={() => onOpenArticle?.(src.slug, src.path)}
          title={src.title}
          style={{
            fontSize: '0.7em',
            verticalAlign: 'super',
            lineHeight: 1,
            color: 'var(--accent-amber)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0 1px',
            fontWeight: 600,
          }}
        >
          [{n}]
        </button>
      );
    },
  };

  const processedSummary =
    brief?.summary && sourceMap.size > 0
      ? injectCiteElements(brief.summary)
      : brief?.summary ?? '';

  const hasSummary = !!brief?.summary;
  const sentTime = brief?.generated_at
    ? new Date(brief.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <>
      <div
        className="mx-2 my-2 rounded-lg px-3 py-2.5"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-mid)' }}>
            Today's Brief
            {exists && brief?.status === 'sent' && sentTime && (
              <span className="ml-1.5 font-normal normal-case tracking-normal" style={{ color: 'var(--text-low)' }}>
                · sent {sentTime}
              </span>
            )}
          </div>
          <button
            onClick={handlePreview}
            className="text-[9.5px] px-2 py-0.5 rounded"
            style={{ border: '1px solid var(--border-default)', color: 'var(--text-mid)' }}
          >
            Preview
          </button>
        </div>

        {/* Summary */}
        {hasSummary ? (
          <div className="text-[11.5px] leading-[1.6]" style={{ color: 'var(--text-default)' }}>
            <div className="prose prose-sm max-w-none">
              {sourceMap.size > 0 ? (
                <ReactMarkdown rehypePlugins={[rehypeRaw]} components={markdownComponents}>
                  {processedSummary}
                </ReactMarkdown>
              ) : (
                <ReactMarkdown>{processedSummary}</ReactMarkdown>
              )}
            </div>
          </div>
        ) : (
          <div className="text-[11px]" style={{ color: 'var(--text-low)' }}>
            No brief generated yet today.
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <button
            onClick={handleSendNow}
            disabled={sending}
            className="text-[10px] px-2 py-1 rounded disabled:opacity-50 transition-colors"
            style={{ background: 'rgba(255,255,255,0.88)', color: 'var(--text-inverse)' }}
          >
            {sending ? 'Sending…' : exists && brief?.status === 'sent' ? 'Resend' : 'Generate & send'}
          </button>
        </div>

        {toast && (
          <div className="mt-1.5 text-[10px]" style={{ color: 'var(--text-mid)' }}>
            {toast}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewHtml && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setPreviewHtml(null)}
        >
          <div
            className="relative rounded-xl overflow-hidden"
            style={{ width: '680px', maxHeight: '85vh', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-high)' }}>
                Brief Preview
              </span>
              <button onClick={() => setPreviewHtml(null)} className="text-[13px]" style={{ color: 'var(--text-mid)' }}>
                ✕
              </button>
            </div>
            <iframe
              srcDoc={previewHtml}
              className="w-full"
              style={{ height: 'calc(85vh - 44px)', background: '#fff', border: 'none' }}
              title="Brief Preview"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      )}
    </>
  );
}
