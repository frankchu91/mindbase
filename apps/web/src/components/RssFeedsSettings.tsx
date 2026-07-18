import { useEffect, useState, useRef } from 'react';
import { apiGet, apiPost, apiDelete, apiPut } from '../lib/api';

interface FeedSummary {
  id: string;
  url: string;
  name: string;
  site_url?: string;
  tags: string[];
  project?: string;
  enabled: boolean;
  interval_minutes?: number;
  added_at: string;
  last_polled_at?: string;
  last_success_at?: string;
  items_ingested_total: number;
  items_ingested_24h: number;
  last_error?: string;
  error_count_24h: number;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RssFeedsSettings() {
  const [feeds, setFeeds] = useState<FeedSummary[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [newTags, setNewTags] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const r = await apiGet<{ feeds: FeedSummary[] }>('/feeds');
      setFeeds(r.feeds);
    } catch {
      // silently ignore poll failures
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  async function add() {
    if (!newUrl) return;
    setError(null);
    setAdding(true);
    try {
      await apiPost('/feeds', {
        url: newUrl,
        tags: newTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setNewUrl('');
      setNewTags('');
      await load();
      showSuccess('Feed added successfully.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function refreshAll() {
    setError(null);
    setRefreshingAll(true);
    try {
      const r = await apiPost<{ feeds_polled: number; total_ingested: number }>('/feeds/refresh-all', {});
      await load();
      showSuccess(`Polled ${r.feeds_polled} feeds, ingested ${r.total_ingested} new items.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshingAll(false);
    }
  }

  async function refreshOne(id: string) {
    setError(null);
    setRefreshingId(id);
    try {
      const r = await apiPost<{ ingested: number; errors: string[] }>(`/feeds/${id}/refresh`, {});
      await load();
      showSuccess(`Fetched — ${r.ingested} new item${r.ingested === 1 ? '' : 's'} ingested.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshingId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Unsubscribe from "${name}"?`)) return;
    setError(null);
    try {
      await apiDelete(`/feeds/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleEnabled(id: string, currentEnabled: boolean) {
    setError(null);
    try {
      await apiPut(`/feeds/${id}`, { enabled: !currentEnabled });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function importOpml(file: File) {
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/feeds/import-opml', { method: 'POST', body: fd });
      const r = await res.json() as { imported: number; skipped: number; errors: string[] };
      await load();
      showSuccess(`Imported ${r.imported} feeds${r.skipped > 0 ? `, ${r.skipped} skipped (already subscribed)` : ''}.`);
      if (r.errors.length > 0) {
        setError(`Some feeds failed: ${r.errors.slice(0, 3).join('; ')}`);
      }
    } catch (e) {
      setError((e as Error).message);
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-semibold text-[13px] mb-1" style={{ color: 'var(--text-high)' }}>
          RSS Subscriptions
        </h3>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-low)' }}>
          MindBase auto-fetches new entries every 60 minutes and compiles them into wiki pages.
        </p>
      </div>

      {successMsg && (
        <div className="text-[11px] px-3 py-2 rounded-md" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--success, #22c55e)' }}>
          {successMsg}
        </div>
      )}

      {error && (
        <div className="text-[11px] px-3 py-2 rounded-md" style={{ background: 'var(--error-bg, rgba(239,68,68,0.1))', color: 'var(--error, #ef4444)' }}>
          {error}
        </div>
      )}

      {/* Feed list */}
      <div className="space-y-2">
        {feeds.length === 0 ? (
          <div className="text-[12px] py-4 text-center" style={{ color: 'var(--text-low)' }}>
            No feeds yet — add one below or import an OPML file.
          </div>
        ) : (
          feeds.map((f) => (
            <div
              key={f.id}
              className="px-3 py-2.5 rounded-[10px]"
              style={{
                background: 'var(--surface-1, rgba(255,255,255,0.04))',
                border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
              }}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-[12px] truncate" style={{ color: 'var(--text-high)' }}>
                      {f.name}
                    </span>
                    {!f.enabled && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-low)' }}>
                        paused
                      </span>
                    )}
                    {f.last_error && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--error, #ef4444)' }}>
                        error
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-low)' }}>
                    {f.url}
                  </div>
                  <div className="text-[10px] mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-low)' }}>
                    <span>{f.items_ingested_24h}/24h · {f.items_ingested_total} total</span>
                    {f.last_polled_at && <span>· polled {timeAgo(f.last_polled_at)}</span>}
                    {f.tags.length > 0 && <span>· {f.tags.join(', ')}</span>}
                  </div>
                  {f.last_error && (
                    <div className="text-[10px] mt-1 truncate" style={{ color: 'var(--error, #ef4444)' }}>
                      {f.last_error}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={() => toggleEnabled(f.id, f.enabled)}
                    className="text-[10px] px-2 py-0.5 rounded transition-colors"
                    style={{
                      color: f.enabled ? 'var(--success, #22c55e)' : 'var(--text-low)',
                      border: '1px solid currentColor',
                    }}
                    title={f.enabled ? 'Pause this feed' : 'Resume this feed'}
                  >
                    {f.enabled ? 'enabled' : 'paused'}
                  </button>
                  <button
                    onClick={() => refreshOne(f.id)}
                    disabled={refreshingId === f.id}
                    className="text-[10px] px-2 py-0.5 rounded disabled:opacity-40"
                    style={{ color: 'var(--accent-azure, #80b4ff)', border: '1px solid currentColor' }}
                  >
                    {refreshingId === f.id ? '…' : 'refresh'}
                  </button>
                  <button
                    onClick={() => remove(f.id, f.name)}
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{ color: 'var(--error, #ef4444)', border: '1px solid currentColor' }}
                  >
                    remove
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add new feed */}
      <div
        className="pt-3 space-y-2"
        style={{ borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}
      >
        <div className="text-[10.5px] font-semibold tracking-wide uppercase" style={{ color: 'var(--text-low)' }}>
          Add feed
        </div>
        <input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="https://example.com/feed.xml"
          className="w-full rounded-[8px] px-3 py-2 text-[12px] font-mono outline-none"
          style={{
            background: 'var(--surface-2, rgba(255,255,255,0.06))',
            border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
            color: 'var(--text-default)',
          }}
        />
        <input
          value={newTags}
          onChange={(e) => setNewTags(e.target.value)}
          placeholder="tags, comma, separated (optional)"
          className="w-full rounded-[8px] px-3 py-2 text-[12px] outline-none"
          style={{
            background: 'var(--surface-2, rgba(255,255,255,0.06))',
            border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
            color: 'var(--text-default)',
          }}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            disabled={adding || !newUrl}
            onClick={add}
            className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold disabled:opacity-40"
            style={{ background: 'var(--accent-azure, #80b4ff)', color: '#0a0a0a' }}
          >
            {adding ? 'Adding…' : 'Add feed'}
          </button>
          <button
            onClick={refreshAll}
            disabled={refreshingAll}
            className="px-3.5 py-1.5 rounded-full text-[12px] disabled:opacity-40"
            style={{
              border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
              color: 'var(--text-default)',
            }}
          >
            {refreshingAll ? 'Refreshing…' : 'Refresh all'}
          </button>
          <label
            className="px-3.5 py-1.5 rounded-full text-[12px] cursor-pointer"
            style={{
              border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
              color: 'var(--text-default)',
            }}
          >
            Import OPML
            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importOpml(f);
              }}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
