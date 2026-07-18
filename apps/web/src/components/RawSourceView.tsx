import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, FileBox, ExternalLink, Download, FileType, FileText, Sparkles, Wand2 } from 'lucide-react';
import { getRawDoc, type RawDocFull } from '../lib/notes';
import { apiPost } from '../lib/api';
import { showToast } from '../store/toast';
import { IngestApprovalModal } from './ingest/IngestApprovalModal';

interface Props {
  rawId: string;
  onBack: () => void;
  onOpenConcept: (slug: string) => void;
}

type ViewMode = 'pdf' | 'text';

export function RawSourceView({ rawId, onBack, onOpenConcept }: Props) {
  const [data, setData] = useState<RawDocFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('pdf');
  const [ingestOpen, setIngestOpen] = useState(false);
  const [classifying, setClassifying] = useState(false);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    getRawDoc(rawId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setViewMode(d.has_binary && d.binary_ext === 'pdf' ? 'pdf' : 'text');
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        showToast(`Couldn't load raw source: ${(e as Error).message}`, 'error');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [rawId]);

  useEffect(() => reload(), [reload]);

  async function classifyWithAi() {
    if (classifying) return;
    setClassifying(true);
    try {
      const r = await apiPost<{ ok: boolean; folder?: string; reason?: string; error?: string }>(
        `/classify/raw/${encodeURIComponent(rawId)}`,
        {},
      );
      if (!r.ok) throw new Error(r.error ?? 'classify failed');
      showToast(`Filed under ${r.folder} — ${r.reason ?? ''}`, 'info');
      reload();
    } catch (e) {
      showToast(`Classify failed: ${(e as Error).message}`, 'error');
    } finally {
      setClassifying(false);
    }
  }

  function compileToWiki() {
    setIngestOpen(true);
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--surface-0)' }} data-testid="raw-source-view">
      {/* Top bar */}
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <button onClick={onBack} className="text-[13px] cursor-pointer" style={{ color: 'var(--accent-azure)' }}>
          <ArrowLeft size={14} strokeWidth={1.8} />
        </button>
        <div className="text-[12px] font-semibold tracking-tight truncate flex-1 inline-flex items-center gap-2" style={{ color: 'var(--text-high)' }}>
          <FileBox size={12} strokeWidth={1.8} />
          {data?.title ?? rawId}
        </div>
        <button
          onClick={() => void classifyWithAi()}
          disabled={classifying || loading || !data}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded cursor-pointer"
          style={{
            background: 'transparent',
            color: 'var(--accent)',
            border: '0.5px solid var(--hairline)',
            opacity: classifying || loading || !data ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { if (!classifying) e.currentTarget.style.background = 'var(--row-hover)'; }}
          onMouseLeave={(e) => { if (!classifying) e.currentTarget.style.background = 'transparent'; }}
          title="Use AI to pick the best folder for this raw source."
          data-testid="classify-raw-button"
        >
          <Wand2 size={13} strokeWidth={1.8} />
          {classifying ? 'Classifying…' : (data?.meta.folder ? 'Reclassify with AI' : 'Classify with AI')}
        </button>
        <button
          onClick={() => compileToWiki()}
          disabled={loading || !data}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded cursor-pointer"
          style={{
            background: 'var(--accent-soft, var(--bg-2))',
            color: 'var(--accent)',
            border: '0.5px solid var(--hairline)',
            opacity: loading || !data ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--row-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-soft, var(--bg-2))'; }}
          title="Send this raw source through the LLM compile pipeline. Will create or update concept pages in the wiki."
          data-testid="compile-raw-to-wiki-button"
        >
          <Sparkles size={13} strokeWidth={1.8} />
          {data?.cited_by_concepts.length ? 'Recompile to Wiki' : 'Compile to Wiki'}
        </button>
      </div>

      {loading ? (
        <div className="px-7 py-8 space-y-3">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-7 w-3/5" />
          <div className="skeleton h-4 w-full mt-6" />
          <div className="skeleton h-4 w-11/12" />
        </div>
      ) : !data ? (
        <div className="px-7 py-8 text-[12px]" style={{ color: 'var(--text-low)' }}>Failed to load.</div>
      ) : (
        <div className="flex-1 overflow-y-auto px-7 py-6">
          {/* Provenance banner */}
          <div
            className="rounded-lg p-3 mb-5 text-[11px]"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-mid)' }}
          >
            <div className="font-semibold mb-1" style={{ color: 'var(--text-default)' }}>
              Raw imported source · read-only
            </div>
            <div className="space-y-1">
              {data.meta.captured_via && (
                <div>via {String(data.meta.captured_via)}{data.meta.captured_at ? ` · ${new Date(String(data.meta.captured_at)).toLocaleDateString()}` : ''}</div>
              )}
              {data.meta.source_url && (
                <div>
                  <a
                    href={String(data.meta.source_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--accent-azure)' }}
                  >
                    {(() => { try { return new URL(String(data.meta.source_url)).hostname; } catch { return String(data.meta.source_url); } })()}
                    <ExternalLink size={10} strokeWidth={1.8} />
                  </a>
                </div>
              )}
              {data.has_binary && data.binary_ext && (
                <div>
                  <a
                    href={data.binary_url ?? ''}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="inline-flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--accent-azure)' }}
                  >
                    <Download size={10} strokeWidth={1.8} />
                    Download original .{data.binary_ext}
                  </a>
                </div>
              )}
            </div>

            {data.cited_by_concepts.length > 0 && (
              <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div className="font-semibold mb-1" style={{ color: 'var(--text-default)' }}>
                  Wiki pages compiled from this:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.cited_by_concepts.map((slug) => (
                    <button
                      key={slug}
                      onClick={() => onOpenConcept(slug)}
                      className="text-[10px] px-2 py-0.5 rounded-full transition-base"
                      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', color: 'var(--accent-azure)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-1)')}
                    >
                      [[{slug}]]
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* View toggle — only shown when a viewable binary is available */}
          {data.has_binary && data.binary_ext === 'pdf' && (
            <div className="flex items-center gap-1 mb-3" data-testid="raw-view-toggle">
              <button
                onClick={() => setViewMode('pdf')}
                className="text-[11px] px-2.5 py-1 rounded inline-flex items-center gap-1.5 transition-base cursor-pointer"
                style={{
                  background: viewMode === 'pdf' ? 'var(--surface-2)' : 'transparent',
                  color: viewMode === 'pdf' ? 'var(--text-high)' : 'var(--text-mid)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <FileType size={11} strokeWidth={1.8} />
                PDF
              </button>
              <button
                onClick={() => setViewMode('text')}
                className="text-[11px] px-2.5 py-1 rounded inline-flex items-center gap-1.5 transition-base cursor-pointer"
                style={{
                  background: viewMode === 'text' ? 'var(--surface-2)' : 'transparent',
                  color: viewMode === 'text' ? 'var(--text-high)' : 'var(--text-mid)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <FileText size={11} strokeWidth={1.8} />
                Extracted text
              </button>
            </div>
          )}

          {viewMode === 'pdf' && data.has_binary && data.binary_ext === 'pdf' ? (
            /* PDF rendered inline via browser-native viewer (no extra dep) */
            <iframe
              src={data.binary_url ?? ''}
              className="w-full rounded-md"
              style={{
                height: 'calc(100vh - 360px)',
                minHeight: '480px',
                background: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
              }}
              title={data.title}
            />
          ) : (
            /* Extracted text fallback (or user toggled to text view) */
            <pre
              className="whitespace-pre-wrap text-[12px] leading-[1.6] font-mono"
              style={{ color: 'var(--text-default)', wordBreak: 'break-word' }}
            >
              {data.content}
            </pre>
          )}
        </div>
      )}

      <IngestApprovalModal
        rawId={rawId}
        open={ingestOpen}
        onClose={() => setIngestOpen(false)}
        onDone={() => { reload(); }}
      />
    </div>
  );
}
