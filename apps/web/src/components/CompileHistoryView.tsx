import { useEffect, useState } from 'react';
import { ActionChip } from './ActionChip';

interface AuditEntry {
  id: number;
  rawId: string | null;
  trigger: string;
  model: string;
  promptVersion: string;
  contextSlugs: string[];
  actions: Array<{ kind: string }>;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

function summarizeActions(actions: Array<{ kind: string }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of actions) m.set(a.kind, (m.get(a.kind) ?? 0) + 1);
  return m;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function CompileHistoryView() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  useEffect(() => {
    fetch('/api/audit-log?limit=50')
      .then((r) => r.json())
      .then((d) => { setEntries(d.entries ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="h-full flex" data-testid="compile-history-view">
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-high)' }}>Compile history</h1>
        <p className="text-sm mb-4" style={{ color: 'var(--text-mid)' }}>
          Every compile run, the model that produced it, the actions it took.
        </p>
        {loading && <div className="text-sm" style={{ color: 'var(--text-mid)' }}>Loading…</div>}
        {!loading && entries.length === 0 && (
          <div className="text-sm" style={{ color: 'var(--text-mid)' }}>No compile runs yet.</div>
        )}
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--hairline)', color: 'var(--text-mid)' }}>
              <th className="text-left py-2 pr-3">When</th>
              <th className="text-left py-2 pr-3">Source</th>
              <th className="text-left py-2 pr-3">Model</th>
              <th className="text-left py-2 pr-3">Actions</th>
              <th className="text-left py-2 pr-3">Tokens</th>
              <th className="text-left py-2 pr-3">Duration</th>
              <th className="text-left py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const sum = summarizeActions(e.actions);
              return (
                <tr
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(e)}
                  style={{ borderBottom: '0.5px solid var(--hairline-soft)' }}
                >
                  <td className="py-2 pr-3" style={{ color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums' }}>
                    {new Date(e.startedAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3" style={{ color: 'var(--text-default)' }}>
                    {e.rawId ?? '—'}
                  </td>
                  <td className="py-2 pr-3" style={{ color: 'var(--text-mid)', fontFamily: 'ui-monospace, monospace' }}>
                    {e.model}
                  </td>
                  <td className="py-2 pr-3">
                    {[...sum.entries()].map(([k, n]) => <ActionChip key={k} kind={k} count={n} />)}
                  </td>
                  <td className="py-2 pr-3" style={{ color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums' }}>
                    {e.inputTokens + e.outputTokens}
                  </td>
                  <td className="py-2 pr-3" style={{ color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatDuration(e.durationMs)}
                  </td>
                  <td className="py-2 pr-3">
                    <span style={{
                      fontSize: 11,
                      color: e.status === 'success' ? 'var(--good)' : e.status === 'error' ? '#ef4444' : 'var(--text-mid)',
                    }}>{e.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <aside style={{
          width: 360,
          borderLeft: '0.5px solid var(--hairline)',
          padding: 16,
          overflowY: 'auto',
          background: 'var(--canvas-bg)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Run #{selected.id}
          </div>
          <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--text-high)' }}>
            {selected.rawId ?? 'untitled'}
          </h2>
          <div className="text-xs mb-3" style={{ color: 'var(--text-mid)' }}>
            <div>model: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{selected.model}</span></div>
            <div>prompt_version: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{selected.promptVersion}</span></div>
            <div>tokens: {selected.inputTokens} in / {selected.outputTokens} out</div>
            <div>duration: {formatDuration(selected.durationMs)}</div>
          </div>
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-mid)' }}>Context pages</div>
          <div className="flex flex-wrap gap-1 mb-3">
            {selected.contextSlugs.map((s) => (
              <span key={s} style={{
                fontSize: 11, padding: '1px 6px', borderRadius: 4,
                background: 'var(--bg-2)', color: 'var(--text-default)',
              }}>{s}</span>
            ))}
          </div>
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-mid)' }}>Actions</div>
          <div>
            {selected.actions.map((a, i) => (
              <div key={i} style={{
                fontSize: 12, padding: '6px 0',
                borderBottom: '0.5px solid var(--hairline-soft)',
              }}>
                <ActionChip kind={a.kind} />
                <span style={{ color: 'var(--text-default)' }}>
                  {(a as { slug?: string }).slug ?? (a as { from?: string }).from ?? (a as { reason?: string }).reason ?? ''}
                </span>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
