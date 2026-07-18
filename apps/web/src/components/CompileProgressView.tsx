import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, Check, X, ArrowRight, ChevronDown } from 'lucide-react';
import { streamCompileNote, type CompileEvent } from '../lib/compile';
import { useCanvasRoute } from '../store/canvas-route';
import { showToast } from '../store/toast';

interface Props {
  sourceSlug: string;
  sourcePath: string;
  onWikiChanged: () => void;
}

type RowStatus = 'running' | 'done' | 'failed';

interface Row {
  id: string;
  status: RowStatus;
  label: string;
  detail?: string;
  durationMs?: number;
  startedAt: number;
}

interface CandidateGroup {
  id: 'candidates';
  items: Array<{ slug: string; title: string; similarity: number }>;
  expanded: boolean;
}

type StreamItem = Row | CandidateGroup;

function isCandidateGroup(x: StreamItem): x is CandidateGroup {
  return (x as CandidateGroup).id === 'candidates';
}

export function CompileProgressView({ sourceSlug, sourcePath, onWikiChanged }: Props) {
  const [items, setItems] = useState<StreamItem[]>([]);
  const [done, setDone] = useState(false);
  const [completeData, setCompleteData] = useState<CompileEvent['payload'] | null>(null);
  const navigate = useCanvasRoute((s) => s.navigate);
  const handleRef = useRef<ReturnType<typeof streamCompileNote> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setDone(false);
    setCompleteData(null);

    const handle = streamCompileNote(sourceSlug, (event) => {
      if (cancelled) return;
      setItems((prev) => updateItems(prev, event));
      if (event.type === 'complete') {
        setCompleteData(event.payload);
        setDone(true);
      }
      if (event.type === 'error') {
        showToast(`Compile failed: ${event.payload.message}`, 'error');
        setDone(true);
      }
    });
    handleRef.current = handle;
    handle.done.then(() => { if (!cancelled) setDone(true); });
    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [sourceSlug]);

  // Auto-navigate to the resulting wiki page 5s after complete; lets the user
  // see the summary before bouncing them away.
  useEffect(() => {
    if (!completeData || !('navigateTo' in completeData) || !completeData.navigateTo) return;
    const t = setTimeout(() => {
      onWikiChanged();
      navigate({ kind: 'note', slug: completeData.navigateTo!.slug, path: completeData.navigateTo!.path, autofocus: false });
    }, 5000);
    return () => clearTimeout(t);
  }, [completeData, navigate, onWikiChanged]);

  function handleOpenWiki() {
    if (completeData && 'navigateTo' in completeData && completeData.navigateTo) {
      onWikiChanged();
      navigate({ kind: 'note', slug: completeData.navigateTo.slug, path: completeData.navigateTo.path, autofocus: false });
    }
  }

  function handleStayHere() {
    navigate({ kind: 'note', slug: sourceSlug, path: sourcePath, autofocus: false });
  }

  function handleCancel() {
    handleRef.current?.cancel();
    showToast('Compile cancelled. Mutations already written remain on disk.', 'info');
    setDone(true);
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--chat-bg)' }} data-testid="compile-progress-view">
      <div className="max-w-2xl mx-auto w-full px-8 py-10">
        <div className="flex items-center gap-2 mb-6" style={{ color: 'var(--text-high)' }}>
          <Sparkles size={16} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
          <h2 className="text-base font-semibold">Compiling: {sourceSlug}</h2>
        </div>

        <div className="flex flex-col gap-1.5" style={{ borderTop: '0.5px solid var(--hairline)', paddingTop: 12 }}>
          {items.map((item, i) => (
            isCandidateGroup(item)
              ? <CandidateRow key={i} items={item.items} expanded={item.expanded} onToggle={() => setItems((prev) => prev.map((p) => isCandidateGroup(p) ? { ...p, expanded: !p.expanded } : p))} />
              : <ProgressRow key={item.id} row={item} />
          ))}
        </div>

        {done && completeData && 'summary' in completeData && (
          <div className="mt-6 pt-4" style={{ borderTop: '0.5px solid var(--hairline)' }}>
            <div className="text-[12px] mb-3" style={{ color: 'var(--text-mid)' }}>
              Done in {(completeData.durationMs / 1000).toFixed(1)}s · {completeData.tokensUsed.input + completeData.tokensUsed.output} tokens
            </div>
            <div className="flex gap-2">
              {('navigateTo' in completeData && completeData.navigateTo) ? (
                <button
                  onClick={handleOpenWiki}
                  className="text-[13px] font-medium px-3 py-1.5 rounded cursor-pointer flex items-center gap-1.5"
                  style={{ background: 'var(--accent)', color: '#ffffff', border: 'none' }}
                  data-testid="compile-open-wiki"
                >
                  Open the updated wiki <ArrowRight size={13} />
                </button>
              ) : null}
              <button
                onClick={handleStayHere}
                className="text-[13px] px-3 py-1.5 rounded cursor-pointer"
                style={{ background: 'transparent', color: 'var(--text-mid)', border: '0.5px solid var(--hairline)' }}
              >
                Back to note
              </button>
            </div>
          </div>
        )}

        {!done && (
          <div className="mt-6 pt-4" style={{ borderTop: '0.5px solid var(--hairline)' }}>
            <button
              onClick={handleCancel}
              className="text-[12px] px-3 py-1 rounded cursor-pointer"
              style={{ background: 'transparent', color: 'var(--text-mid)', border: '0.5px solid var(--hairline)' }}
              data-testid="compile-cancel"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressRow({ row }: { row: Row }) {
  const Icon = row.status === 'running' ? Loader2 : row.status === 'done' ? Check : X;
  const color = row.status === 'failed' ? '#ef4444' : row.status === 'done' ? 'var(--text-mid)' : 'var(--accent)';
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded" style={{ background: 'transparent' }}>
      <Icon
        size={13}
        strokeWidth={2}
        style={{ color, flexShrink: 0, marginTop: 2, ...(row.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[13px]" style={{ color: 'var(--text-default)' }}>{row.label}</div>
        {row.detail && <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{row.detail}</div>}
      </div>
      {row.durationMs !== undefined && (
        <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
          {(row.durationMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

function CandidateRow({ items, expanded, onToggle }: { items: Array<{ slug: string; title: string; similarity: number }>; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="flex flex-col gap-1 py-1.5 px-2 rounded">
      <button onClick={onToggle} className="flex items-center gap-2 text-left cursor-pointer">
        <ChevronDown size={13} strokeWidth={2} style={{ color: 'var(--text-mid)', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
        <span className="text-[13px]" style={{ color: 'var(--text-default)' }}>
          Found {items.length} related wiki page{items.length === 1 ? '' : 's'}
        </span>
      </button>
      {expanded && items.length > 0 && (
        <ul className="pl-6 pt-1 flex flex-col gap-0.5">
          {items.map((c) => (
            <li key={c.slug} className="text-[12px] flex items-center gap-2" style={{ color: 'var(--text-mid)' }}>
              <span style={{ color: 'var(--text-default)' }}>{c.title}</span>
              <span className="text-[10.5px] font-mono" style={{ color: 'var(--text-faint)' }}>
                {Math.round(c.similarity * 100)}% similar
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function updateItems(prev: StreamItem[], event: CompileEvent): StreamItem[] {
  const now = Date.now();
  switch (event.type) {
    case 'status':
      return [...prev, { id: `status-${prev.length}`, status: 'done', label: event.payload.text, startedAt: now, durationMs: 0 }];
    case 'candidates':
      return [...prev, { id: 'candidates', items: event.payload.items, expanded: true } as CandidateGroup];
    case 'tool_start':
      return [...prev, {
        id: `tool-${prev.length}`,
        status: 'running',
        label: `${event.payload.name}${event.payload.slug ? ` → ${event.payload.slug}` : ''}`,
        startedAt: now,
      }];
    case 'tool_done': {
      const idx = [...prev].reverse().findIndex((p) => !isCandidateGroup(p) && p.status === 'running' && p.label.startsWith(event.payload.name));
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.map((p, i) => {
        if (i !== realIdx) return p;
        if (isCandidateGroup(p)) return p;
        return {
          ...p,
          status: event.payload.ok ? 'done' : 'failed',
          ...(event.payload.error ? { detail: event.payload.error } : {}),
          durationMs: Date.now() - p.startedAt,
        } satisfies Row;
      });
    }
    case 'complete':
    case 'error':
      return prev;
    default:
      return prev;
  }
}
