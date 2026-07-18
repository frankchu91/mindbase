import { useState, useEffect, useCallback, useMemo } from 'react';
import { Trash2, ChevronRight, ChevronDown, FileText, BookOpen, Inbox, MessageCircle, FileQuestion } from 'lucide-react';
import { listTrash, restoreFromTrash, permanentlyDelete, emptyTrash, type TrashEntry } from '../lib/trash';
import { showToast } from '../store/toast';

interface Props {
  onBack: () => void;
  onWikiChanged: () => void;
  /** Bumps whenever something elsewhere in the app deletes a file. Re-fetch
   *  the trash listing so the new entry shows up without a page reload. */
  wikiReloadKey?: number;
}

type Category = 'note' | 'wiki' | 'raw' | 'chat' | 'other';

interface ClassifiedFile {
  originalPath: string;
  category: Category;
  displayName: string;
}

// Wiki vs Notes is determined by meta.kind, NOT by path — both live under
// wiki/notes/. The server captures `kind` from meta.json into the trash manifest
// at delete time so we don't have to re-read meta files here.
const WIKI_KINDS = new Set(['concept', 'person', 'project']);
const NOTE_KINDS = new Set(['note', 'daily', 'meeting']);

function classifyFile(file: TrashEntry['files'][number]): ClassifiedFile {
  const { originalPath, kind, title } = file;
  const base = originalPath.split('/').pop() ?? originalPath;
  const slug = base.replace(/\.(md|meta\.json|json)$/, '');
  // Prefer the human title captured from meta; slug is the fallback.
  const displayName = title && title.trim().length > 0 ? title : slug;

  if (originalPath.startsWith('chats/')) return { originalPath, category: 'chat', displayName };
  if (originalPath.startsWith('raw/')) return { originalPath, category: 'raw', displayName };

  // wiki/notes/ — use captured kind. The server normalizes missing kind to
  // 'concept' (Wiki) at trash time to match the listing endpoint, so legacy
  // entries with no kind on the manifest also default to Wiki here.
  if (originalPath.startsWith('wiki/notes/')) {
    if (kind && NOTE_KINDS.has(kind)) return { originalPath, category: 'note', displayName };
    if (kind && WIKI_KINDS.has(kind)) return { originalPath, category: 'wiki', displayName };
    return { originalPath, category: 'wiki', displayName };
  }
  if (originalPath.startsWith('wiki/')) return { originalPath, category: 'wiki', displayName };
  return { originalPath, category: 'other', displayName: title ?? base };
}

// Hide .meta.json sibling rows — they're internal twins of .md content.
function visibleFiles(files: TrashEntry['files']): ClassifiedFile[] {
  return files
    .filter((f) => !f.originalPath.endsWith('.meta.json'))
    .map(classifyFile);
}

function categoryStyle(c: Category): { label: string; color: string; Icon: typeof FileText } {
  switch (c) {
    case 'note': return { label: 'Note', color: '#60a5fa', Icon: Inbox };
    case 'wiki': return { label: 'Wiki', color: '#a78bfa', Icon: BookOpen };
    case 'raw':  return { label: 'Raw',  color: '#fbbf24', Icon: FileText };
    case 'chat': return { label: 'Chat', color: '#34d399', Icon: MessageCircle };
    default:     return { label: '?',    color: '#94a3b8', Icon: FileQuestion };
  }
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type FilterTab = 'all' | 'note' | 'wiki' | 'raw' | 'chat';
const TABS: ReadonlyArray<{ id: FilterTab; label: string }> = [
  { id: 'all',  label: 'All'   },
  { id: 'note', label: 'Notes' },
  { id: 'wiki', label: 'Wiki'  },
  { id: 'raw',  label: 'Raw'   },
  { id: 'chat', label: 'Chats' },
];

export function TrashView({ onBack, onWikiChanged, wikiReloadKey }: Props) {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<FilterTab>('all');

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setEntries(await listTrash()); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  // Re-fetch whenever wikiReloadKey changes — fires after any delete from
  // LeftRail, ArticleView, NotePane, etc. so trash updates live without a
  // browser refresh.
  useEffect(() => { void reload(); }, [reload, wikiReloadKey]);

  // Pre-classify all entries so we can count per-tab + filter cheaply.
  const enriched = useMemo(() => entries.map((entry) => {
    const files = visibleFiles(entry.files);
    const categories = new Set<Category>(files.map((f) => f.category));
    return { entry, files, categories };
  }), [entries]);

  const counts: Record<FilterTab, number> = useMemo(() => {
    const c: Record<FilterTab, number> = { all: 0, note: 0, wiki: 0, raw: 0, chat: 0 };
    for (const e of enriched) {
      for (const f of e.files) {
        c.all += 1;
        if (f.category === 'note' || f.category === 'wiki' || f.category === 'raw' || f.category === 'chat') {
          c[f.category] += 1;
        }
      }
    }
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    if (tab === 'all') return enriched;
    return enriched.filter((e) => e.categories.has(tab));
  }, [enriched, tab]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleRestore(id: string, label: string) {
    setBusy(id);
    try {
      const result = await restoreFromTrash(id);
      onWikiChanged();
      const msg = result.skipped.length > 0
        ? `Restored "${label}" (${result.skipped.length} skipped — already exist)`
        : `Restored "${label}"`;
      showToast(msg, 'info');
      await reload();
    } catch (e) { showToast(`Restore failed: ${(e as Error).message}`, 'error'); }
    finally { setBusy(null); }
  }

  async function handlePermanentDelete(id: string, label: string) {
    if (!window.confirm(`Permanently delete "${label}"? This cannot be undone.`)) return;
    setBusy(id);
    try {
      await permanentlyDelete(id);
      showToast(`Permanently deleted "${label}"`, 'info');
      await reload();
    } catch (e) { showToast(`Delete failed: ${(e as Error).message}`, 'error'); }
    finally { setBusy(null); }
  }

  async function handleEmptyTrash() {
    if (entries.length === 0) return;
    if (!window.confirm(`Permanently delete all ${entries.length} entries in Trash? This cannot be undone.`)) return;
    setBusy('empty');
    try {
      await emptyTrash();
      showToast('Trash emptied', 'info');
      setEntries([]);
    } catch (e) { showToast(`Empty trash failed: ${(e as Error).message}`, 'error'); }
    finally { setBusy(null); }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--chat-bg)' }} data-testid="trash-view">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--hairline)' }}>
        <button
          onClick={onBack}
          className="text-sm font-medium px-2 py-0.5 rounded cursor-pointer"
          style={{ color: 'var(--accent)', background: 'transparent' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          ← Back
        </button>
        <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-high)' }}>
          <Trash2 size={14} strokeWidth={1.6} /> Trash
        </div>
        <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
          {entries.length} batch{entries.length !== 1 ? 'es' : ''} · {counts.all} item{counts.all !== 1 ? 's' : ''}
        </span>
        <div style={{ flex: 1 }} />
        {entries.length > 0 && (
          <button
            onClick={() => void handleEmptyTrash()}
            disabled={busy === 'empty'}
            className="text-[12px] px-3 py-1.5 rounded-md cursor-pointer"
            style={{
              color: '#ef4444',
              border: '0.5px solid var(--hairline)',
              background: 'transparent',
              opacity: busy === 'empty' ? 0.5 : 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            data-testid="trash-empty-button"
          >
            {busy === 'empty' ? 'Emptying…' : 'Empty Trash'}
          </button>
        )}
      </div>

      {/* Category tabs */}
      {entries.length > 0 && (
        <div className="flex items-center px-4 gap-5" style={{ borderBottom: '0.5px solid var(--hairline)' }}>
          {TABS.map((t) => {
            const active = t.id === tab;
            const count = counts[t.id];
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="relative py-2.5 cursor-pointer"
                style={{
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--text-high)' : 'var(--text-mid)',
                  background: 'transparent',
                }}
                data-testid={`trash-tab-${t.id}`}
              >
                {t.label}
                <span className="ml-1.5" style={{ fontSize: 11, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                  {count}
                </span>
                {active && (
                  <span className="absolute left-0 right-0" style={{ bottom: -1, height: 1.5, background: 'var(--text-high)' }} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
        {loading && (
          <div className="text-[12px] py-8 text-center" style={{ color: 'var(--text-faint)' }}>Loading…</div>
        )}

        {error && (
          <div className="text-[12px] px-3 py-2 rounded-md" style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444' }}>
            Error: {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Trash2 size={36} strokeWidth={1.2} style={{ color: 'var(--text-faint)' }} />
            <div className="text-[13px]" style={{ color: 'var(--text-mid)' }}>Trash is empty</div>
            <div className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
              Deleted notes appear here before permanent removal.
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && entries.length > 0 && (
          <div className="text-[12px] py-8 text-center" style={{ color: 'var(--text-faint)' }}>
            No {tab === 'all' ? 'entries' : `${tab}s`} in trash.
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex flex-col gap-2">
            {filtered.map(({ entry, files }) => {
              const isBusy = busy === entry.id;
              const isOpen = expanded.has(entry.id);
              const isBatch = files.length > 1;
              const headerLabel = isBatch ? `Batch of ${files.length} items` : (files[0]?.displayName ?? entry.label);

              return (
                <div
                  key={entry.id}
                  className="rounded-[10px] flex flex-col"
                  style={{
                    background: 'var(--bg-2)',
                    border: '0.5px solid var(--hairline)',
                    opacity: isBusy ? 0.6 : 1,
                    transition: 'opacity 0.15s ease',
                  }}
                  data-testid="trash-entry"
                >
                  {/* Entry header (collapsible) */}
                  <div className="p-3 flex items-start gap-3">
                    <button
                      onClick={() => toggleExpanded(entry.id)}
                      className="mt-0.5 cursor-pointer p-0 bg-transparent border-0"
                      style={{ color: 'var(--text-mid)' }}
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[13px] font-medium truncate cursor-pointer"
                        style={{ color: 'var(--text-high)' }}
                        onClick={() => toggleExpanded(entry.id)}
                      >
                        {headerLabel}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                          Deleted {formatTimeAgo(entry.deletedAt)}
                        </span>
                        {/* Category breakdown chips */}
                        {(['note', 'wiki', 'raw', 'chat'] as Category[]).map((c) => {
                          const n = files.filter((f) => f.category === c).length;
                          if (n === 0) return null;
                          const cs = categoryStyle(c);
                          return (
                            <span
                              key={c}
                              className="text-[10px] px-1.5 py-px rounded"
                              style={{ background: `${cs.color}22`, color: cs.color, fontWeight: 600 }}
                            >
                              {n} {cs.label.toLowerCase()}{n !== 1 ? 's' : ''}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => void handleRestore(entry.id, headerLabel)}
                        disabled={isBusy}
                        className="text-[11px] px-2.5 py-1 rounded-md cursor-pointer"
                        style={{
                          color: 'var(--accent)',
                          border: '0.5px solid var(--hairline)',
                          background: 'transparent',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        title="Restore all files in this batch to their original locations"
                        data-testid="trash-restore-button"
                      >
                        {isBusy ? 'Restoring…' : 'Restore'}
                      </button>
                      <button
                        onClick={() => void handlePermanentDelete(entry.id, headerLabel)}
                        disabled={isBusy}
                        className="text-[11px] px-2.5 py-1 rounded-md cursor-pointer"
                        style={{
                          color: '#ef4444',
                          border: '0.5px solid var(--hairline)',
                          background: 'transparent',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        title="Permanently delete (cannot be undone)"
                        data-testid="trash-permanent-delete-button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Expanded file list */}
                  {isOpen && (
                    <div
                      className="px-3 pb-3"
                      style={{ borderTop: '0.5px solid var(--hairline)' }}
                    >
                      <div className="pt-2 flex flex-col gap-0.5">
                        {files.map((f) => {
                          const cs = categoryStyle(f.category);
                          return (
                            <div
                              key={f.originalPath}
                              className="flex items-center gap-2 py-1 px-2 rounded"
                              style={{ background: 'transparent' }}
                            >
                              <cs.Icon size={12} strokeWidth={1.6} style={{ color: cs.color, flexShrink: 0 }} />
                              <span
                                className="text-[12px] truncate"
                                style={{ color: 'var(--text-default)', flex: 1, minWidth: 0 }}
                              >
                                {f.displayName}
                              </span>
                              <span
                                className="text-[10px] font-mono truncate"
                                style={{ color: 'var(--text-faint)', maxWidth: 220 }}
                                title={f.originalPath}
                              >
                                {f.originalPath}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
