export interface InboxEntry {
  id: string;
  type: string;
  title?: string;
  url?: string;
  status: string;
  captured_at: string;
  captured_via: string;
  error?: string;
  wiki_slug?: string;
}

const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  queued: { background: 'var(--badge-yellow-bg)', color: 'var(--badge-yellow-text)' },
  processing: { background: 'var(--badge-blue-bg)', color: 'var(--badge-blue-text)' },
  compiled: { background: 'var(--badge-green-bg)', color: 'var(--badge-green-text)' },
  failed: { background: 'var(--badge-red-bg)', color: 'var(--badge-red-text)' },
};

// Fallback badge styles using known CSS vars if badge-specific vars aren't defined
const STATUS_FALLBACK: Record<string, { background: string; color: string }> = {
  queued: { background: 'rgba(234,179,8,0.15)', color: '#a16207' },
  processing: { background: 'rgba(59,130,246,0.15)', color: '#1d4ed8' },
  compiled: { background: 'rgba(34,197,94,0.15)', color: '#15803d' },
  failed: { background: 'rgba(239,68,68,0.15)', color: 'var(--error)' },
};

function statusStyle(status: string) {
  return STATUS_FALLBACK[status] ?? { background: 'var(--surface-2)', color: 'var(--text-mid)' };
}

export function InboxList({
  entries,
  onCompile,
  onDelete,
  onOpenWiki,
}: {
  entries: InboxEntry[];
  onCompile: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenWiki?: (slug: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="text-sm py-12 text-center" style={{ color: 'var(--text-mid)' }}>
        Inbox is empty.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-start justify-between p-4 rounded-lg"
          style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
        >
          {/* Left: meta + title + error + wiki link */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {/* Status + type + captured_via + timestamp row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="px-2 py-0.5 text-[10px] rounded-full font-semibold"
                style={statusStyle(e.status)}
              >
                {e.status}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-mid)' }}>
                {e.type} · {e.captured_via}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                {new Date(e.captured_at).toLocaleString()}
              </span>
            </div>

            {/* Title / URL */}
            <div
              className="text-sm font-medium truncate"
              style={{ color: 'var(--text-high)' }}
              title={e.title ?? e.url ?? '(no title)'}
            >
              {e.title ?? e.url ?? '(no title)'}
            </div>

            {/* Error */}
            {e.error && (
              <div className="text-xs" style={{ color: 'var(--error)' }}>
                {e.error}
              </div>
            )}

            {/* Wiki page link */}
            {e.wiki_slug && onOpenWiki && (
              <button
                onClick={() => onOpenWiki(e.wiki_slug!)}
                className="text-xs text-left w-fit hover:underline transition-base"
                style={{ color: 'var(--accent)' }}
              >
                View wiki page →
              </button>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="flex gap-2 ml-4 mt-0.5 shrink-0">
            {(e.status === 'queued' || e.status === 'failed') && (
              <button
                onClick={() => onCompile(e.id)}
                className="text-xs px-3 py-1.5 rounded-md transition-colors"
                style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-bg, rgba(59,130,246,0.1))')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {e.status === 'failed' ? 'Retry' : 'Compile now'}
              </button>
            )}
            <button
              onClick={() => onDelete(e.id)}
              className="text-xs px-3 py-1.5 rounded-md transition-colors"
              style={{ color: 'var(--error)', border: '1px solid var(--error)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--error-bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
