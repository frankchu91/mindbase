import { useEffect, useState } from 'react';
import { InboxList, type InboxEntry } from './InboxList';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { InboxEmpty } from './empty/InboxEmpty';

export function InboxPage({
  onBack,
  onOpenArticle,
}: {
  onBack: () => void;
  onOpenArticle?: (slug: string, path: string) => void;
}) {
  const [entries, setEntries] = useState<InboxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await apiGet<{ entries: InboxEntry[] }>('/inbox');
      setEntries(r.entries);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, []);

  async function compile(id: string) {
    try {
      await apiPost<{ ok: boolean }>(`/inbox/${id}/compile`, {});
      void load();
    } catch (e) {
      alert(`Compile failed: ${(e as Error).message}`);
    }
  }

  async function del(id: string) {
    if (!confirm('Delete this captured item?')) return;
    try {
      await apiDelete<{ ok: boolean }>(`/inbox/${id}`);
      void load();
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
    }
  }

  function openWiki(slug: string) {
    if (onOpenArticle) onOpenArticle(slug, `wiki/notes/${slug}`);
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-sidebar)' }}>
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <button
          onClick={onBack}
          className="icon-button text-sm font-medium w-7 h-7 flex items-center justify-center"
          aria-label="Back"
          style={{ color: 'var(--accent)' }}
        >
          ←
        </button>
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Inbox
        </div>
        {entries.length > 0 && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full ml-1"
            style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}
          >
            {entries.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="text-sm mb-4 px-3 py-2 rounded-md" style={{ color: 'var(--error)', background: 'var(--error-bg)' }}>
            {error}
          </div>
        )}
        {loading && entries.length === 0 ? (
          <div className="text-sm py-8 text-center" style={{ color: 'var(--text-mid)' }}>
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <InboxEmpty />
        ) : (
          <InboxList
            entries={entries}
            onCompile={(id) => void compile(id)}
            onDelete={(id) => void del(id)}
            onOpenWiki={onOpenArticle ? openWiki : undefined}
          />
        )}
      </div>
    </div>
  );
}
