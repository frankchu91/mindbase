// apps/web/src/components/CommandPalette.tsx
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import {
  Plus, Zap, Activity, Settings as SettingsIcon, Trash2, Network, Layers,
  BookOpen, Inbox, FileText, History, Moon, SunMedium, FilePlus2, Sparkles, Focus,
  type LucideIcon,
} from 'lucide-react';
import { useHoistStore } from '../store/hoist';
import { useCanvasRoute } from '../store/canvas-route';
import { hybridSearch, parseOperators, fetchSuggestions } from '../lib/search';
import type { HybridResult, FederatedResult } from '../lib/search';
import { SearchResultRow } from './SearchResultRow';
import { relativeTime } from '../lib/time-buckets';
import { useRecentNotes } from '../store/recent-notes';
import { useShellState } from '../store/shell-state';
import { RecentEmpty } from './empty/RecentEmpty';

// ---------------------------------------------------------------------------
// useDebounce hook
// ---------------------------------------------------------------------------
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Action {
  id: string;
  Icon: LucideIcon;
  label: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenArticle: (slug: string, path: string) => void;
  onLoadChat: (id: string) => void;
  onOpenIngest: () => void;
  onOpenHealth: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  // Phase 2: navigation actions
  onOpenHome: () => void;
  onOpenGraph: () => void;
  onOpenStream: () => void;
  onOpenReview: () => void;
  onOpenInbox: () => void;
  onOpenTrash: () => void;
  onOpenAuditLog: () => void;
  onNewNote: () => void;
}

// Active filter chip displayed below input
interface FilterChip {
  kind: 'tag' | 'since' | 'type' | 'project';
  label: string;
}

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------
export function CommandPalette({
  open,
  onClose,
  onOpenArticle,
  onLoadChat,
  onOpenIngest,
  onOpenHealth,
  onOpenSettings,
  onNewChat,
  onOpenHome,
  onOpenGraph,
  onOpenStream,
  onOpenReview,
  onOpenInbox,
  onOpenTrash,
  onOpenAuditLog,
  onNewNote,
}: Props) {
  const theme = useShellState((s) => s.theme);
  const toggleTheme = useShellState((s) => s.toggleTheme);
  const focusMode = useShellState((s) => s.focusMode);
  const toggleFocus = useShellState((s) => s.toggleFocus);
  const recentNotes = useRecentNotes((s) => s.recent);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HybridResult[]>([]);
  const [inboxResults, setInboxResults] = useState<FederatedResult[]>([]);
  const [chatResults, setChatResults] = useState<FederatedResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterChips, setFilterChips] = useState<FilterChip[]>([]);
  const [suggestions, setSuggestions] = useState<{ expansions: string[]; suggestions: Array<{ slug: string; title: string }> } | null>(null);
  const [askOpen, setAskOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebounce(query, 200);

  // Auto-focus input when palette opens; restore stored query
  useEffect(() => {
    if (!open) {
      setAskOpen(false);
      return;
    }
    // Restore last query from sessionStorage
    const saved = sessionStorage.getItem('mb-palette-query');
    if (saved) setQuery(saved);
    setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  // Persist query across closes
  useEffect(() => {
    if (query) sessionStorage.setItem('mb-palette-query', query);
  }, [query]);

  // Parse operator chips from query
  useEffect(() => {
    const { filters } = parseOperators(query);
    const chips: FilterChip[] = [];
    for (const tag of filters.tags ?? []) chips.push({ kind: 'tag', label: `tag:${tag}` });
    if (filters.since_days) chips.push({ kind: 'since', label: `since:${filters.since_days}d` });
    if (filters.type) chips.push({ kind: 'type', label: `type:${filters.type}` });
    if (filters.project) chips.push({ kind: 'project', label: `project:${filters.project}` });
    setFilterChips(chips);
  }, [query]);

  // Hybrid search on debounced query change
  useEffect(() => {
    if (!open) return;
    if (!debouncedQuery.trim()) {
      setResults([]);
      setInboxResults([]);
      setChatResults([]);
      setSuggestions(null);
      return;
    }

    // Cancel previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setSuggestions(null);

    hybridSearch(debouncedQuery, { limit: 8, federate: true, signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setResults(data.results);
        setInboxResults(data.federated?.inbox ?? []);
        setChatResults(data.federated?.chats ?? []);
        setActiveIdx(0);

        // Zero-result recovery
        if (data.results.length < 3 && debouncedQuery.trim().length > 2) {
          fetchSuggestions(debouncedQuery, controller.signal)
            .then((s) => {
              if (controller.signal.aborted) return;
              if (s.expansions.length > 0 || s.suggestions.length > 0) {
                setSuggestions(s);
              }
            })
            .catch(() => {});
        }
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        console.warn('[search]', e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, open]);

  // Build flat list for keyboard navigation
  const totalResults = results.length;
  const totalFederated = inboxResults.length + chatResults.length;

  // Scroll selected item into view
  useLayoutEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.querySelectorAll('[data-nav-item]')[activeIdx];
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const actions: Action[] = [
    // Create
    { id: 'new-note', Icon: FilePlus2, label: query.trim() ? `New note: "${query.trim()}"` : 'New note', run: () => { onNewNote(); onClose(); } },
    { id: 'new-chat', Icon: Plus, label: query.trim() ? `New chat about "${query.trim()}"` : 'New chat', run: () => { onNewChat(); onClose(); } },
    { id: 'ingest', Icon: Zap, label: 'Ingest a URL or file', run: () => { onOpenIngest(); onClose(); } },
    // Navigate
    { id: 'go-home', Icon: Sparkles, label: 'Go to Home', run: () => { onOpenHome(); onClose(); } },
    { id: 'go-inbox', Icon: Inbox, label: 'Go to Inbox', run: () => { onOpenInbox(); onClose(); } },
    { id: 'go-stream', Icon: FileText, label: 'Go to Stream', run: () => { onOpenStream(); onClose(); } },
    { id: 'go-graph', Icon: Network, label: 'Go to Graph', run: () => { onOpenGraph(); onClose(); } },
    { id: 'go-review', Icon: Layers, label: 'Go to Review', run: () => { onOpenReview(); onClose(); } },
    { id: 'go-audit', Icon: History, label: 'Go to Compile history', run: () => { onOpenAuditLog(); onClose(); } },
    { id: 'go-trash', Icon: Trash2, label: 'Go to Trash', run: () => { onOpenTrash(); onClose(); } },
    // Toggle
    { id: 'toggle-theme', Icon: theme === 'light' ? Moon : SunMedium, label: `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`, run: () => { toggleTheme(); onClose(); } },
    { id: 'toggle-focus', Icon: BookOpen, label: focusMode ? 'Exit focus mode' : 'Enter focus mode', run: () => { toggleFocus(); onClose(); } },
    { id: 'focus-current-note', Icon: Focus, label: 'Focus on current note', run: () => {
      const route = useCanvasRoute.getState().route;
      if (route?.kind !== 'note') return;
      useHoistStore.getState().hoist(
        { kind: 'note', slug: route.slug },
        route.slug,
      );
      onClose();
    } },
    // Other
    { id: 'health', Icon: Activity, label: 'Run Wiki Health', run: () => { onOpenHealth(); onClose(); } },
    { id: 'settings', Icon: SettingsIcon, label: 'Settings', run: () => { onOpenSettings(); onClose(); } },
  ];

  const totalItems = totalResults + totalFederated + actions.length;

  const activateSelected = useCallback(() => {
    if (activeIdx < totalResults) {
      const r = results[activeIdx];
      if (r) { onOpenArticle(r.slug, r.path); onClose(); }
    } else if (activeIdx < totalResults + inboxResults.length) {
      // Inbox: open inbox panel (placeholder — just close for now)
      onClose();
    } else if (activeIdx < totalResults + totalFederated) {
      // Chat: load the chat
      const chatIdx = activeIdx - totalResults - inboxResults.length;
      const c = chatResults[chatIdx];
      if (c) { onLoadChat(c.id); onClose(); }
    } else {
      const actionIdx = activeIdx - totalResults - totalFederated;
      actions[actionIdx]?.run();
    }
  }, [activeIdx, results, inboxResults, chatResults, actions, totalResults, totalFederated, onOpenArticle, onLoadChat, onClose]);

  // Global ⌘+K to toggle palette
  useEffect(() => {
    function onGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) {
          inputRef.current?.focus();
        }
        // The parent App handles open/close toggle
      }
    }
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [open]);

  // Palette keyboard nav
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'Escape':
          if (askOpen) { setAskOpen(false); return; }
          onClose();
          return;

        case 'ArrowDown':
          e.preventDefault();
          setActiveIdx((i) => Math.min(i + 1, totalItems - 1));
          return;

        case 'ArrowUp':
          e.preventDefault();
          setActiveIdx((i) => Math.max(i - 1, 0));
          return;

        case 'Enter':
          if (e.metaKey || e.ctrlKey) {
            // ⌘+Enter → open Ask modal
            if (results.length > 0) {
              e.preventDefault();
              setAskOpen(true);
            }
            return;
          }
          e.preventDefault();
          activateSelected();
          return;

        default:
          // ⌘+1..⌘+9 jump
          if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
            const n = parseInt(e.key, 10) - 1;
            if (n < results.length) {
              e.preventDefault();
              const r = results[n];
              if (r) { onOpenArticle(r.slug, r.path); onClose(); }
            }
          }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, askOpen, totalItems, activateSelected, results, onOpenArticle, onClose]);

  if (!open) return null;

  const hasQuery = query.trim().length > 0;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center"
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', paddingTop: 80 }}
        onClick={onClose}
      >
        <div
          className="w-[580px] rounded-[14px] overflow-hidden flex flex-col"
          style={{
            background: 'var(--win-bg)',
            backdropFilter: 'blur(40px) saturate(180%)',
            border: '1px solid var(--hairline)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            maxHeight: '70vh',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Input row */}
          <div
            className="flex items-center gap-3 px-4 py-3.5 shrink-0"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <span style={{ color: loading ? 'var(--accent)' : 'var(--text-low)', transition: 'color 0.2s' }}>
              {loading ? '⟳' : '⌕'}
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search knowledge…  try tag: since: type:"
              className="flex-1 bg-transparent outline-none text-[14px]"
              style={{ color: 'var(--text-high)' }}
            />
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-mono cursor-pointer"
              style={{ background: 'var(--surface-2)', color: 'var(--text-low)' }}
              onClick={onClose}
            >esc</span>
          </div>

          {/* Filter chips */}
          {filterChips.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5 px-4 py-2 shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              {filterChips.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => setQuery((q) => q.replace(chip.label, '').replace(/\s+/g, ' ').trim())}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(var(--accent-rgb, 99,102,241), 0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb, 99,102,241), 0.3)' }}
                >
                  {chip.label}
                  <span style={{ opacity: 0.6 }}>×</span>
                </button>
              ))}
            </div>
          )}

          {/* Results list */}
          <div ref={listRef} className="overflow-y-auto flex-1 py-2">

            {/* Recent notes — shown when query is empty + no chips active */}
            {!hasQuery && filterChips.length === 0 && recentNotes.length > 0 && (
              <>
                <div className="px-4 py-1 text-[9px] uppercase font-semibold" style={{ color: 'var(--text-low)', letterSpacing: '1.5px' }}>
                  Recent · {recentNotes.length}
                </div>
                {recentNotes.slice(0, 5).map((r) => (
                  <button
                    key={r.slug}
                    className="w-full text-left px-4 py-2 flex items-center gap-2"
                    style={{ background: 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => { onOpenArticle(r.slug, r.path); onClose(); }}
                  >
                    <FileText size={13} style={{ color: 'var(--text-low)', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate" style={{ color: 'var(--text-high)' }}>{r.title || r.slug}</div>
                      <div className="text-[10px] truncate" style={{ color: 'var(--text-low)' }}>{relativeTime(r.openedAt)}</div>
                    </div>
                  </button>
                ))}
              </>
            )}
            {!hasQuery && filterChips.length === 0 && recentNotes.length === 0 && (
              <RecentEmpty />
            )}

            {/* Wiki results */}
            {results.length > 0 && (
              <>
                <div className="px-4 py-1 text-[9px] uppercase font-semibold" style={{ color: 'var(--text-low)', letterSpacing: '1.5px' }}>
                  Wiki Pages · {results.length}
                </div>
                {results.map((r, i) => (
                  <div key={r.slug} data-nav-item>
                    <SearchResultRow
                      result={r}
                      isActive={activeIdx === i}
                      index={i}
                      onOpen={(slug, path) => { onOpenArticle(slug, path); onClose(); }}
                      onMouseEnter={() => setActiveIdx(i)}
                    />
                  </div>
                ))}
              </>
            )}

            {/* Federated: inbox */}
            {inboxResults.length > 0 && (
              <>
                <div className="px-4 py-1 mt-1 text-[9px] uppercase font-semibold" style={{ color: 'var(--text-low)', letterSpacing: '1.5px' }}>
                  Inbox · {inboxResults.length}
                </div>
                {inboxResults.map((r, i) => {
                  const navIdx = totalResults + i;
                  return (
                    <button
                      key={r.id}
                      data-nav-item
                      className="w-full text-left px-4 py-2"
                      style={{ background: activeIdx === navIdx ? 'var(--row-hover)' : 'transparent' }}
                      onMouseEnter={() => setActiveIdx(navIdx)}
                      onClick={onClose}
                    >
                      <div className="text-[12px] truncate" style={{ color: 'var(--text-high)' }}>{r.title}</div>
                      <div className="text-[10px] truncate" style={{ color: 'var(--text-low)' }}>{r.snippet}</div>
                    </button>
                  );
                })}
              </>
            )}

            {/* Federated: chats */}
            {chatResults.length > 0 && (
              <>
                <div className="px-4 py-1 mt-1 text-[9px] uppercase font-semibold" style={{ color: 'var(--text-low)', letterSpacing: '1.5px' }}>
                  Chats · {chatResults.length}
                </div>
                {chatResults.map((r, i) => {
                  const navIdx = totalResults + inboxResults.length + i;
                  return (
                    <button
                      key={r.id}
                      data-nav-item
                      className="w-full text-left px-4 py-2"
                      style={{ background: activeIdx === navIdx ? 'var(--row-hover)' : 'transparent' }}
                      onMouseEnter={() => setActiveIdx(navIdx)}
                      onClick={() => { onLoadChat(r.id); onClose(); }}
                    >
                      <div className="text-[12px] truncate" style={{ color: 'var(--text-high)' }}>{r.title}</div>
                      <div className="text-[10px] truncate" style={{ color: 'var(--text-low)' }}>{r.snippet}</div>
                    </button>
                  );
                })}
              </>
            )}

            {/* Zero-result suggestions */}
            {suggestions && (
              <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
                <div className="text-[10px] mb-2" style={{ color: 'var(--text-low)' }}>
                  Few results for "{debouncedQuery}"
                </div>
                {suggestions.suggestions.length > 0 && (
                  <>
                    <div className="text-[9px] uppercase font-semibold mb-1" style={{ color: 'var(--text-faint)', letterSpacing: '1px' }}>Did you mean?</div>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.suggestions.map((s) => (
                        <button
                          key={s.slug}
                          onClick={() => setQuery(s.title)}
                          className="text-[10px] px-2 py-0.5 rounded"
                          style={{ background: 'var(--surface-2)', color: 'var(--text-mid)' }}
                        >
                          {s.title}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {suggestions.expansions.length > 0 && (
                  <>
                    <div className="text-[9px] uppercase font-semibold mt-2 mb-1" style={{ color: 'var(--text-faint)', letterSpacing: '1px' }}>Try instead:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.expansions.map((e) => (
                        <button
                          key={e}
                          onClick={() => setQuery(e)}
                          className="text-[10px] px-2 py-0.5 rounded"
                          style={{ background: 'var(--surface-2)', color: 'var(--text-mid)' }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="px-4 py-1 mt-1 text-[9px] uppercase font-semibold" style={{ color: 'var(--text-low)', letterSpacing: '1.5px' }}>
              Actions
            </div>
            {actions.map((a, i) => {
              const navIdx = totalResults + totalFederated + i;
              return (
                <button
                  key={a.id}
                  data-nav-item
                  onClick={a.run}
                  className="w-full text-left px-4 py-2 flex items-center gap-3"
                  style={{ background: activeIdx === navIdx ? 'var(--row-hover)' : 'transparent' }}
                  onMouseEnter={() => setActiveIdx(navIdx)}
                >
                  <a.Icon size={14} strokeWidth={1.6} style={{ color: 'var(--text-tertiary)' }} className="shrink-0" />
                  <div className="flex-1 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>{a.label}</div>
                </button>
              );
            })}

            {/* No results */}
            {hasQuery && !loading && results.length === 0 && inboxResults.length === 0 && chatResults.length === 0 && !suggestions && (
              <div className="px-4 py-3 text-[11px]" style={{ color: 'var(--text-low)' }}>
                No matches — searching…
              </div>
            )}
          </div>

          {/* Bottom hint bar */}
          <div
            className="px-4 py-2 flex items-center gap-4 text-[9px] shrink-0"
            style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-faint)' }}
          >
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            {results.length > 0 && <span>⌘↵ ask AI</span>}
            <span>⌘1-9 jump</span>
            <span>esc close</span>
            {results.length > 0 && (
              <button
                className="ml-auto text-[9px] px-2 py-0.5 rounded"
                style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}
                onClick={() => setAskOpen(true)}
              >
                ⌘↵ Ask AI about results
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SearchAskModal — opens on ⌘+Enter */}
      {askOpen && results.length > 0 && (
        <SearchAskModal
          query={query}
          contextSlugs={results.slice(0, 5).map((r) => r.slug)}
          contextTitles={results.slice(0, 5).map((r) => ({ slug: r.slug, title: r.title }))}
          onClose={() => setAskOpen(false)}
          onOpenArticle={onOpenArticle}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// SearchAskModal — inline here so it shares the same file's imports cleanly
// ---------------------------------------------------------------------------
interface SourceRef {
  n: number;
  slug: string;
  title: string;
}

interface AskModalProps {
  query: string;
  contextSlugs: string[];
  contextTitles: Array<{ slug: string; title: string }>;
  onClose: () => void;
  onOpenArticle: (slug: string, path: string) => void;
}

function SearchAskModal({ query, contextSlugs, contextTitles, onClose, onOpenArticle }: AskModalProps) {
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const r = await fetch('/api/search/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q: query, context_slugs: contextSlugs }),
          signal: controller.signal,
        });

        if (!r.ok || !r.body) {
          setError(`HTTP ${r.status}`);
          return;
        }

        // Build source map from contextTitles
        setSources(
          contextTitles.map((t, i) => ({ n: i + 1, slug: t.slug, title: t.title })),
        );

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            try {
              const evt = JSON.parse(line.slice(5).trim()) as { kind: string; text?: string; error?: string };
              if (evt.kind === 'delta' && evt.text) setAnswer((a) => a + evt.text);
              if (evt.kind === 'done') setDone(true);
              if (evt.kind === 'error') setError(evt.error ?? 'Unknown error');
            } catch { /* skip */ }
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError((e as Error).message);
        }
      }
    })();

    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Esc closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Render [N] citation markers as clickable superscripts
  function renderAnswer(text: string) {
    const parts: React.ReactNode[] = [];
    let last = 0;
    const re = /\[(\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const n = parseInt(m[1]!, 10);
      const src = sources.find((s) => s.n === n);
      parts.push(
        <button
          key={`cite-${m.index}`}
          onClick={() => src && onOpenArticle(src.slug, `wiki/notes/${src.slug}.md`)}
          style={{
            fontSize: '0.7em',
            verticalAlign: 'super',
            lineHeight: 1,
            padding: '0 3px',
            borderRadius: 3,
            background: 'rgba(var(--accent-rgb, 99,102,241), 0.15)',
            color: 'var(--accent)',
            cursor: src ? 'pointer' : 'default',
            border: 'none',
          }}
        >
          [{n}]
        </button>,
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', paddingTop: 100 }}
      onClick={onClose}
    >
      <div
        className="w-[620px] rounded-[14px] overflow-hidden flex flex-col"
        style={{
          background: 'rgba(12,15,26,0.97)',
          border: '1px solid var(--border-strong)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          maxHeight: '65vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 flex items-center" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex-1">
            <div className="text-[12px] font-semibold" style={{ color: 'var(--text-high)' }}>
              Ask about your search results
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-low)' }}>
              Query: "{query}" · Using top {Math.min(5, contextSlugs.length)} pages as context
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[10px] px-2 py-1 rounded"
            style={{ background: 'var(--surface-2)', color: 'var(--text-low)' }}
          >
            esc
          </button>
        </div>

        {/* Answer body */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ fontSize: 13, color: 'var(--text-high)', lineHeight: 1.7 }}>
          {error && (
            <div style={{ color: 'var(--error)' }}>Error: {error}</div>
          )}
          {!error && answer.length === 0 && (
            <div style={{ color: 'var(--text-low)' }}>Thinking…</div>
          )}
          {answer && (
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {renderAnswer(answer)}
              {!done && <span style={{ color: 'var(--accent)', animation: 'pulse 1s infinite' }}>▌</span>}
            </div>
          )}
        </div>

        {/* Sources panel */}
        {sources.length > 0 && (
          <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="text-[9px] uppercase font-semibold mb-2" style={{ color: 'var(--text-faint)', letterSpacing: '1px' }}>
              Sources
            </div>
            <div className="flex flex-col gap-1">
              {sources.map((s) => (
                <button
                  key={s.slug}
                  onClick={() => onOpenArticle(s.slug, `wiki/notes/${s.slug}.md`)}
                  className="text-left text-[11px] flex items-center gap-2"
                  style={{ color: 'var(--text-mid)', cursor: 'pointer' }}
                >
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>[{s.n}]</span>
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
