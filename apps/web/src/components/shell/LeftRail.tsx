import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  Search as SearchIcon,
  Network, Rss, SquareCheck, History, Settings as SettingsIcon, House,
  Trash2, Plus, Sparkles,
} from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useShellState } from '../../store/shell-state';
import { useCanvasRoute } from '../../store/canvas-route';
import { showToast } from '../../store/toast';
import { CategoryTreeRoot } from '../tree/CategoryTreeRoot';

interface ChatSessionSummary {
  id: string;
  title: string;
  updated: string;
  messageCount: number;
}

export interface LeftRailProps {
  wikiReloadKey: number;
  currentChatId: string | null;
  onOpenArticle: (slug: string, path: string) => void;
  onOpenChat: (id: string) => void;
  onOpenRaw: (rawId: string) => void;
  onSearch: () => void;
  /** kind decides whether the created file becomes a Note (`note`) or a
   *  Wiki page (`concept`) — picked from the active LeftRail tab. */
  onNewNote: (kind: 'note' | 'concept') => void;
  onOpenIngest: () => void;
  /** Signals an app-wide refresh after a mutation (delete, rename, etc.).
   *  Propagates to TrashView, PulseHome, GraphView, etc. so they update
   *  without a browser reload. */
  onWikiChanged: () => void;
}

export function LeftRail({
  wikiReloadKey,
  currentChatId,
  onOpenArticle,
  onOpenChat,
  onSearch,
  onWikiChanged,
  onNewNote,
  onOpenIngest,
}: LeftRailProps) {
  const navigate = useCanvasRoute((s) => s.navigate);
  const route = useCanvasRoute((s) => s.route);
  const leftRailWidth = useShellState((s) => s.leftRailWidth);
  const setLeftRailWidth = useShellState((s) => s.setLeftRailWidth);
  const focusMode = useShellState((s) => s.focusMode);

  const [chats, setChats] = useState<ChatSessionSummary[]>([]);
  const [search, setSearch] = useState('');

  // Kind tab: which section is currently visible. Naming reflects the
  // pivot-plan 3-layer architecture:
  //   'wiki'  → Knowledge tab — LLM-owned wiki/concepts/ pages (the artifact)
  //   'notes' → Drafts tab — user-owned wiki/notes/ pages + raw imports
  //   'chats' → Chats tab — chat session list (no tree)
  // Default is 'wiki' because the wiki is the main product surface.
  // Phase 4 of wiki-as-main-surface: one unified tree (concepts + notes + raw)
  // instead of a Knowledge/Drafts tab dance. Chats stay as a separate tab —
  // they're a different data shape (sessions, not files).
  // Wiki v2: the left rail is a Wiki tab (category tree) + Chats tab.
  // The category tree owns its own counts internally via /api/tree.
  type Kind = 'all' | 'chats';
  const [activeKind, setActiveKind] = useState<Kind>('all');

  // Local reload trigger so we can refresh after mutations. Also fires the
  // app-wide onWikiChanged so other surfaces (TrashView, PulseHome, GraphView)
  // re-fetch — otherwise a delete here would leave them stale.
  const [localReload, setLocalReload] = useState(0);
  const triggerReload = useCallback(() => {
    setLocalReload((n) => n + 1);
    onWikiChanged();
  }, [onWikiChanged]);

  useEffect(() => {
    apiGet<{ sessions: ChatSessionSummary[] }>('/chats')
      .then((r) => setChats(r.sessions))
      .catch(() => setChats([]));
  }, [wikiReloadKey, currentChatId, localReload]);

  const filteredChats = useMemo(
    () => chats.filter((c) => !search.trim() || c.title.toLowerCase().includes(search.toLowerCase())),
    [chats, search],
  );

  // Multi-select state (chats only)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastCheckedIdx = useRef<number>(-1);

  function clearSel() {
    setSelected(new Set());
    lastCheckedIdx.current = -1;
  }

  // ⌘K global shortcut: open global search overlay
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onSearch();
      }
      if (e.key === 'Escape') clearSel();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSearch]);

  // Drag-resize logic (same shape as LibraryPane / ChatPane)
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(leftRailWidth);
  function onMove(e: MouseEvent) {
    if (!dragging.current) return;
    setLeftRailWidth(startW.current + (e.clientX - startX.current));
  }
  function onUp() {
    dragging.current = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
  useEffect(() => () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }, []);

  if (focusMode) return null;

  function startResize(e: React.MouseEvent) {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = leftRailWidth;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  async function handleDeleteChat(id: string) {
    try {
      const res = await fetch(`/api/chats/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('Chat deleted', 'info');
      triggerReload();
    } catch (e) {
      showToast(`Delete failed: ${(e as Error).message}`, 'error');
    }
  }

  // Bulk trash for chats — selection is chat ids; we trash chats/<id>.json paths.
  async function handleBulkDelete() {
    if (selected.size === 0) return;
    const chatPaths: string[] = [];
    const chatIds: string[] = [];
    for (const c of filteredChats) {
      if (selected.has(c.id)) chatIds.push(c.id);
    }
    if (chatIds.length === 0) {
      clearSel();
      return;
    }
    let moved = 0;
    let failed = 0;
    for (const id of chatIds) {
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.ok) moved += 1; else failed += 1;
      } catch { failed += 1; }
    }
    if (moved > 0) {
      showToast(
        `Deleted ${moved} chat${moved !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}.`,
        'info',
      );
    } else if (failed > 0) {
      showToast(`Delete failed for ${failed} chat${failed !== 1 ? 's' : ''}.`, 'error');
    }
    clearSel();
    triggerReload();
  }

  // Checkbox toggle with shift-range and single-click semantics — chats only.
  const activeIds: string[] = filteredChats.map((c) => c.id);
  function toggleSelect(id: string, idx: number, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastCheckedIdx.current >= 0) {
        const lo = Math.min(idx, lastCheckedIdx.current);
        const hi = Math.max(idx, lastCheckedIdx.current);
        const allChecked = activeIds.slice(lo, hi + 1).every((x) => prev.has(x));
        for (let i = lo; i <= hi; i++) {
          const item = activeIds[i];
          if (!item) continue;
          if (allChecked) next.delete(item);
          else next.add(item);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    lastCheckedIdx.current = idx;
  }

  const showBulkBar = selected.size > 0;

  return (
    <section
      data-testid="left-rail"
      className="flex-shrink-0 flex flex-col relative"
      style={{
        width: leftRailWidth,
        background: 'var(--chat-bg)',
        borderRight: '0.5px solid var(--hairline)',
      }}
    >
      {/* Header: MindBase logo + wordmark */}
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-3">
        <div
          className="w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-deep) 100%)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.15), inset 0 0.5px 0 rgba(255,255,255,0.3)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.4} className="w-3 h-3">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
          </svg>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-title)', letterSpacing: '-0.02em' }}>
          MindBase
        </div>
      </div>

      {/* Search — local filter; ⌘K badge also triggers global search overlay */}
      <div className="px-4 pb-3">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md"
          style={{ background: 'var(--bg-2)', border: '0.5px solid var(--hairline)' }}
        >
          <SearchIcon size={13} strokeWidth={1.8} style={{ color: 'var(--text-faint)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-default)' }}
            data-testid="library-search"
          />
          <span
            className="px-1.5 py-0.5 rounded text-[10px] cursor-pointer"
            style={{
              background: 'var(--bg-3)',
              color: 'var(--text-faint)',
              fontFamily: '-apple-system, ui-monospace, monospace',
            }}
            onClick={onSearch}
            title="Open global search (⌘K)"
          >
            ⌘K
          </span>
        </div>
      </div>

      {/* Kind tabs — three way switch between Notes / Wiki / Chats.
          Notes + Wiki feed the unified tree (filtered by kind);
          Chats switches to the flat chat list below. */}
      <div
        className="flex items-center gap-1 px-2"
        style={{ borderBottom: '0.5px solid var(--hairline)' }}
      >
        {([
          // Wiki v2: the Wiki tab hosts CategoryTreeRoot (README, Context, Soul,
          // Contributors, Research, Raw, Logs, Artifacts). Chats stay separate.
          { id: 'all', label: 'Wiki', count: null },
          { id: 'chats', label: 'Chats', count: chats.length },
        ] as Array<{ id: Kind; label: string; count: number | null }>).map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveKind(tab.id); clearSel(); }}
            className="text-[11.5px] px-2 py-1.5 rounded cursor-pointer flex items-center gap-1.5"
            style={{
              background: 'transparent',
              border: 'none',
              color: activeKind === tab.id ? 'var(--text-high)' : 'var(--text-mid)',
              fontWeight: activeKind === tab.id ? 600 : 400,
              borderBottom: activeKind === tab.id ? '2px solid var(--accent, #60a5fa)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab.label}
            {tab.count !== null && (
              <span
                className="text-[10px] px-1 rounded"
                style={{ background: 'var(--bg-3)', color: 'var(--text-faint)' }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
        {activeKind !== 'chats' && (
          <PlusMenu
            activeKind={activeKind}
            onNewNote={onNewNote}
            onOpenIngest={onOpenIngest}
          />
        )}
      </div>

      {/* Main scroll region — either the unified tree (Notes/Wiki) or the chat list. */}
      {activeKind === 'chats' ? (
        <div
          className="flex-1 overflow-y-auto px-2 py-2 relative"
          style={{ paddingBottom: showBulkBar ? 60 : 8 }}
        >
          <ChatList
            sessions={filteredChats}
            currentChatId={currentChatId}
            onOpen={onOpenChat}
            onDelete={handleDeleteChat}
            selected={selected}
            onToggleSelect={toggleSelect}
          />

          {/* Floating bulk action bar — opaque background so list items behind
              it are visually hidden, not just covered with a transparent shell. */}
          {showBulkBar && (
            <div
              className="absolute left-2 right-2 bottom-2 rounded-lg flex items-center gap-3 px-3 py-2"
              style={{
                background: 'var(--bg-1, var(--chat-bg))',
                border: '1px solid var(--hairline)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.12)',
                zIndex: 20,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-high)' }}>
                {selected.size} selected
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleBulkDelete}
                className="text-[12px] px-2 py-1 rounded cursor-pointer"
                style={{ color: 'var(--error)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Move to Trash
              </button>
              <button
                onClick={clearSel}
                className="text-[11px] px-2 py-1 rounded cursor-pointer"
                style={{ color: 'var(--text-mid)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <CategoryTreeRoot
            reloadKey={wikiReloadKey}
            onOpen={(category, path) => onOpenArticle(category, path)}
          />
        </div>
      )}

      {/* VIEWS section — pushed to bottom by flex-1 above */}
      <div
        className="px-2 pb-2"
        style={{ borderTop: '0.5px solid var(--hairline)' }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-faint)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '12px 12px 4px',
          }}
        >
          VIEWS
        </div>
        <ViewItem
          label="Wiki"
          icon={<House size={14} strokeWidth={1.8} />}
          kbd="⌘0"
          active={route.kind === 'home'}
          onClick={() => navigate({ kind: 'home' })}
          testId="dock-item-home"
        />
        <ViewItem
          label="Dashboard"
          icon={<Sparkles size={14} strokeWidth={1.8} />}
          active={route.kind === 'dashboard'}
          onClick={() => navigate({ kind: 'dashboard' })}
          testId="dock-item-dashboard"
        />
        <ViewItem
          label="Graph"
          icon={<Network size={14} strokeWidth={1.8} />}
          kbd="⌘G"
          active={route.kind === 'graph'}
          onClick={() => navigate({ kind: 'graph' })}
          testId="dock-item-graph"
        />
        <ViewItem
          label="Stream"
          icon={<Rss size={14} strokeWidth={1.8} />}
          active={route.kind === 'stream'}
          onClick={() => navigate({ kind: 'stream' })}
          testId="dock-item-stream"
        />
        <ViewItem
          label="Review"
          icon={<SquareCheck size={14} strokeWidth={1.8} />}
          active={route.kind === 'review'}
          onClick={() => navigate({ kind: 'review' })}
          testId="dock-item-review"
        />
        <ViewItem
          label="Compile history"
          icon={<History size={14} strokeWidth={1.8} />}
          active={route.kind === 'audit-log' || route.kind === 'audit-log-detail'}
          onClick={() => navigate({ kind: 'audit-log' })}
          testId="dock-item-compile history"
        />
        <ViewItem
          label="Trash"
          icon={<Trash2 size={14} strokeWidth={1.8} />}
          active={route.kind === 'trash'}
          onClick={() => navigate({ kind: 'trash' })}
          testId="dock-item-trash"
        />
        <ViewItem
          label="Settings"
          icon={<SettingsIcon size={14} strokeWidth={1.8} />}
          active={route.kind === 'settings'}
          onClick={() => navigate({ kind: 'settings' })}
          testId="dock-item-settings"
        />
        <div className="px-2.5 pt-2 pb-1">
          <ThemeToggle />
        </div>
      </div>

      {/* Drag-resize handle — invisible until hover (Notion-style discoverability) */}
      <div
        className="absolute top-0 bottom-0 cursor-col-resize z-10 group/resize"
        style={{ right: -3, width: 6 }}
        onMouseDown={startResize}
        data-testid="library-resize-handle"
      >
        <div
          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 transition-opacity opacity-0 group-hover/resize:opacity-100"
          style={{ width: 2, background: 'var(--accent)' }}
        />
      </div>

    </section>
  );
}

// ─── ViewItem ────────────────────────────────────────────────────────────────

function ViewItem({
  label,
  icon,
  kbd,
  active,
  onClick,
  testId,
}: {
  label: string;
  icon: React.ReactNode;
  kbd?: string;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <div
      className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-md cursor-pointer my-px relative"
      style={{
        background: active ? 'var(--bg-3)' : 'transparent',
        color: active ? 'var(--text-high)' : 'var(--text-mid)',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '-0.005em',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--row-hover)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
      onClick={onClick}
      data-testid={testId}
    >
      <span
        className="flex-shrink-0 flex items-center"
        style={{ color: active ? 'var(--accent)' : 'var(--text-mid)', width: 14, height: 14 }}
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {kbd && (
        <span
          style={{
            fontFamily: '-apple-system, ui-monospace, monospace',
            fontSize: 10,
            color: 'var(--text-faint)',
            padding: '1px 5px',
            background: 'var(--bg-2)',
            borderRadius: 3,
            border: '0.5px solid var(--hairline)',
          }}
        >
          {kbd}
        </span>
      )}
    </div>
  );
}

// ─── ThemeToggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const theme = useShellState((s) => s.theme);
  const toggle = useShellState((s) => s.toggleTheme);
  return (
    <button
      data-testid="dock-theme-toggle"
      onClick={toggle}
      className="text-[11px] px-2 py-1 rounded-md cursor-pointer w-full text-left"
      style={{ color: 'var(--text-mid)', background: 'transparent' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {theme === 'light' ? '🌙 Dark mode' : '☀ Light mode'}
    </button>
  );
}

// ─── List helpers ─────────────────────────────────────────────────────────────

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── ChatList ─────────────────────────────────────────────────────────────────

function ChatList({
  sessions,
  currentChatId,
  onOpen,
  onDelete,
  selected,
  onToggleSelect,
}: {
  sessions: ChatSessionSummary[];
  currentChatId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  selected: Set<string>;
  onToggleSelect: (id: string, idx: number, shift: boolean) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <div className="px-3 py-6 text-center" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        No conversations yet.
      </div>
    );
  }
  return (
    <>
      {sessions.map((s, idx) => {
        const active = s.id === currentChatId;
        const isHovered = hoveredId === s.id;
        const isSelected = selected.has(s.id);
        const showCheckbox = isHovered || isSelected;
        return (
          <div
            key={s.id}
            className="w-full text-left px-3 py-1.5 rounded-md flex items-center gap-2 my-px cursor-pointer"
            style={{ background: active ? 'var(--bg-3)' : 'transparent' }}
            onMouseEnter={(e) => {
              setHoveredId(s.id);
              if (!active) e.currentTarget.style.background = 'var(--row-hover)';
            }}
            onMouseLeave={(e) => {
              setHoveredId(null);
              if (!active) e.currentTarget.style.background = 'transparent';
            }}
            onClick={() => onOpen(s.id)}
          >
            {/* Bullet → checkbox swap (mirrors FileList pattern) */}
            <span
              className="flex-shrink-0 flex items-center justify-center"
              style={{ width: 14, height: 14 }}
              onClick={(e) => {
                if (!showCheckbox) return;
                e.stopPropagation();
                onToggleSelect(s.id, idx, e.shiftKey);
              }}
            >
              {showCheckbox ? (
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  className="cursor-pointer"
                  style={{ width: 13, height: 13, accentColor: 'var(--accent)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(s.id, idx, e.shiftKey);
                  }}
                />
              ) : (
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-faint)' }} />
              )}
            </span>

            <span
              className="flex-1 truncate"
              style={{
                fontSize: 12.5,
                color: active ? 'var(--text-high)' : 'var(--text-default)',
                fontWeight: 500,
              }}
            >
              {s.title}
            </span>
            {/* Single-delete button — hover only, hidden when in multi-select */}
            <button
              className="flex-shrink-0 flex items-center justify-center rounded"
              style={{
                width: 18,
                height: 18,
                opacity: isHovered && !isSelected ? 1 : 0,
                color: 'var(--error)',
                transition: 'opacity 0.12s ease',
                pointerEvents: isHovered && !isSelected ? 'auto' : 'none',
              }}
              onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
              title="Delete chat"
            >
              <Trash2 size={12} strokeWidth={1.8} />
            </button>
            <span
              className="flex-shrink-0"
              style={{
                fontSize: 10.5,
                color: 'var(--text-faint)',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 400,
              }}
            >
              {formatWhen(s.updated)}
            </span>
          </div>
        );
      })}
    </>
  );
}

// ─── PlusMenu ────────────────────────────────────────────────────────────────
// Dropdown menu for the "+" button in the tab strip. Items: New (note or
// concept, based on active tab) + Ingest a URL / file.

function PlusMenu({
  activeKind,
  onNewNote,
  onOpenIngest,
}: {
  activeKind: 'notes' | 'wiki' | 'all';
  onNewNote: (kind: 'note' | 'concept') => void;
  onOpenIngest: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen((v) => !v);
  }

  // Per pivot plan: the user does NOT manually create wiki concepts (LLM-owned
  // layer). On the Knowledge tab the "+" only offers ingestion. On the Drafts
  // tab the "+" offers both "New draft" (user-written notes) and ingest.
  const showNewDraft = activeKind !== 'wiki';

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="ml-auto mr-1 my-1 w-6 h-6 flex items-center justify-center rounded cursor-pointer"
        style={{
          color: open ? 'var(--accent)' : 'var(--text-mid)',
          background: open ? 'var(--row-hover)' : 'transparent',
        }}
        onMouseEnter={(e) => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--row-hover)'; }}
        onMouseLeave={(e) => { if (!open) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        title={activeKind === 'wiki' ? 'Add a source for the LLM to compile' : 'New…'}
        aria-label="New"
      >
        <Plus size={14} strokeWidth={2} />
      </button>

      {open && menuPos && (
        <div
          ref={menuRef}
          className="fixed z-50 rounded-lg shadow-xl py-1"
          style={{
            top: menuPos.top,
            right: menuPos.right,
            width: 220,
            background: 'var(--win-bg)',
            border: '1px solid var(--hairline)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
          }}
        >
          {showNewDraft && (
            <PlusMenuItem
              label="New draft"
              onClick={() => { setOpen(false); onNewNote('note'); }}
            />
          )}
          <PlusMenuItem
            label="Ingest a URL or file…"
            onClick={() => { setOpen(false); onOpenIngest(); }}
          />
          {!showNewDraft && (
            <div
              className="px-3 py-1.5 text-[10.5px]"
              style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--hairline)', marginTop: 2 }}
            >
              Knowledge pages are written by the LLM as you ingest sources.
            </div>
          )}
        </div>
      )}
    </>
  );
}

function PlusMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] cursor-pointer"
      style={{ color: 'var(--text-default)', background: 'transparent' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  );
}
