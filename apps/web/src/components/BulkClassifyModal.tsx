import { useEffect, useRef, useState } from 'react';
import { startBulkClassify, streamBulkProgress } from '../lib/folders';
import { showToast } from '../store/toast';

interface Props {
  scope: 'unfiled' | 'all';
  onClose: () => void;
}

export function BulkClassifyModal({ scope, onClose }: Props) {
  const [state, setState] = useState<{ done: number; total: number; errors: number; status: 'starting' | 'running' | 'done' | 'failed' }>({
    done: 0, total: 0, errors: 0, status: 'starting',
  });
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const jobId = await startBulkClassify(scope);
        if (!alive) return;
        cancelRef.current = streamBulkProgress(jobId, (e) => {
          if (!alive) return;
          if (e.type === 'progress') {
            setState((s) => ({ ...s, ...e.payload, status: 'running' }));
          } else if (e.type === 'done') {
            setState((s) => ({ ...s, ...e.payload, status: 'done' }));
          }
        });
      } catch (err) {
        if (!alive) return;
        showToast(`Bulk classify failed: ${(err as Error).message}`, 'error');
        setState((s) => ({ ...s, status: 'failed' }));
      }
    })();
    return () => { alive = false; cancelRef.current?.(); };
  }, [scope]);

  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-lg p-6 w-96" style={{ background: 'var(--bg-panel)', border: '0.5px solid var(--hairline)' }}>
        <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-high)' }}>
          Classify {scope === 'unfiled' ? 'unfiled' : 'all'} notes
        </h3>
        <div className="text-[13px] mb-2" style={{ color: 'var(--text-mid)' }}>
          {state.status === 'starting' && 'Starting…'}
          {state.status === 'running' && `${state.done} / ${state.total} (${pct}%)`}
          {state.status === 'done' && `Done — ${state.done} classified, ${state.errors} errors`}
          {state.status === 'failed' && 'Failed to start'}
        </div>
        <div className="h-2 rounded mb-4" style={{ background: 'var(--bg-input)' }}>
          <div className="h-full rounded" style={{ width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[13px] rounded cursor-pointer"
            style={{ background: 'transparent', color: 'var(--text-default)', border: '0.5px solid var(--hairline)' }}
          >
            {state.status === 'running' ? 'Hide' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
