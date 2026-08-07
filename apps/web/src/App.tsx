import { useState, useEffect, useCallback } from 'react';
import { useChat } from './store/chat';
import { useSettings } from './store/settings';
import { useCanvasRoute } from './store/canvas-route';
import { usePageTabsSync } from './store/page-tabs-sync';
import { useShellState } from './store/shell-state';
import { apiGet } from './lib/api';
import { AppShell } from './components/shell/AppShell';
import type { CanvasCallbacks } from './components/shell/Canvas';
import { SetupWizard } from './components/SetupWizard';
import { CommandPalette } from './components/CommandPalette';
import { IndexingToast } from './components/IndexingToast';
import { AddEntryModal } from './components/AddEntryModal';
import { ToastHost } from './components/Toast';
import { showToast } from './store/toast';

// Phase E wiki v2: known tree categories that MAY appear as the first arg of
// onOpenArticle / onOpenNote. Anything not in this set is treated as a legacy
// slug (from CommandPalette, GraphView, ChatMessage citations, etc.) and
// mapped to `research` per Phase E fallback contract.
const TREE_CATEGORIES = new Set(['readme', 'context', 'soul', 'contributors', 'research', 'raw', 'logs', 'artifacts']);

function normalizeArticleRoute(categoryOrSlug: string, path: string): { category: string; slug: string; path: string } {
  if (TREE_CATEGORIES.has(categoryOrSlug)) {
    // Fresh Phase E call from CategoryTreeRoot / LeftRail.
    const base = path.split('/').pop() ?? path;
    const slug = base.replace(/\.md$/i, '');
    return { category: categoryOrSlug, slug, path };
  }
  // TODO(v2): legacy caller passed (slug, wiki/notes/<slug>.md). Strip the
  // v1 `wiki/notes/` prefix and route to research/ by default. Wiki pages
  // live in wiki/concepts/ under v1 — the server falls back between the
  // two dirs. Under v2 the target is research/<slug>.md.
  const slug = categoryOrSlug;
  const stripped = path.replace(/^wiki\/(notes|concepts)\//, '');
  const finalPath = stripped.endsWith('.md') ? stripped : `${slug}.md`;
  return { category: 'research', slug, path: finalPath };
}

export default function App() {
  const [wikiReloadKey, setWikiReloadKey] = useState(0);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState('New Conversation');
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Cmd+I — Add entry (wiki v2 Phase G): simple direct-append to today's
  // contributor daily note via POST /api/tree/contributors/daily.
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  // Google sync state — promoted from old LeftPanel.
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const chatStore = useChat();
  const settings = useSettings();
  const navigate = useCanvasRoute((s) => s.navigate);

  // Sync canvas-route ↔ page-tabs: navigating to a page-like route opens it
  // in a tab (or switches to an existing one). Cmd+W closes the active tab.
  usePageTabsSync();

  const toggleFocus = useShellState((s) => s.toggleFocus);
  const toggleTheme = useShellState((s) => s.toggleTheme);
  const back = useCanvasRoute((s) => s.back);
  const forward = useCanvasRoute((s) => s.forward);

  function onWikiChanged() {
    setWikiReloadKey((k) => k + 1);
  }

  // "New draft" / Cmd+N / palette "New note" → create a real note file under
  // the user's contributor layer (sources/contributors/<user>/notes/) and
  // open it in the full NotePane editor. Quick capture stays on Cmd+I.
  const handleNewNote = useCallback(() => {
    void (async () => {
      try {
        let user = localStorage.getItem('mindbase-username') ?? '';
        if (!user) {
          // Solo projects usually have exactly one contributor dir — reuse it.
          const r = await fetch('/api/tree/contributors');
          const users = r.ok ? Object.keys(((await r.json()) as { users?: Record<string, unknown> }).users ?? {}) : [];
          user = users[0] ?? 'me';
        }
        const path = `${user}/notes/untitled-${Date.now().toString(36)}.md`;
        const res = await fetch(`/api/tree/contributors/${path}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: '' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        onWikiChanged();
        navigate({ kind: 'note', slug: path.replace(/\.md$/, ''), path, category: 'contributors', autofocus: true });
      } catch (e) {
        showToast(`New note failed: ${(e as Error).message}`, 'error');
      }
    })();
  }, [navigate]);

  // Onboarding load
  useEffect(() => {
    if (!settings.loaded) {
      settings.loadFromServer();
      return;
    }
    // Respect a prior "skip for now" — browsing/capture work without an LLM,
    // and plugin-first users may never configure one here at all.
    if (!settings.isConfigured() && localStorage.getItem('mindbase.onboardingSkipped') !== '1') {
      setOnboarding(true);
    }
  }, [settings.loaded]);

  // Auto-save current chat — preserved verbatim from old App.tsx.
  useEffect(() => {
    if (chatStore.messages.length === 0) return;
    const allDone = chatStore.messages.every((m) => m.status === 'done' || m.status === 'error');
    if (!allDone) return;
    const id = currentChatId ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (!currentChatId) setCurrentChatId(id);
    const firstUser = chatStore.messages.find((m) => m.role === 'user');
    const title = firstUser?.text.slice(0, 60) ?? 'Untitled';
    setChatTitle(title);
    const session = {
      id, title, created: '', updated: '',
      messages: chatStore.messages.map((m) => ({ role: m.role, text: m.text, citations: m.citations })),
    };
    fetch(`/api/chats/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(session),
    }).catch(() => {});
  }, [chatStore.messages, currentChatId]);

  // Keyboard shortcuts — preserved + extended with new shell shortcuts.
  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'k') { e.preventDefault(); setPaletteOpen(true); return; }
      if (key === 'i') { e.preventDefault(); setAddEntryOpen(true); return; }
      if (key === 'n' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleNewNote(); return; }
      // New shell shortcuts.
      if (key === '0') { e.preventDefault(); navigate({ kind: 'home' }); return; }
      if (key === 'g') { e.preventDefault(); navigate({ kind: 'graph' }); return; }
      if (key === '\\') { e.preventDefault(); toggleFocus(); return; }
      if (key === 'l' && e.shiftKey) { e.preventDefault(); toggleTheme(); return; }
      if (key === '[') { e.preventDefault(); back(); return; }
      if (key === ']') { e.preventDefault(); forward(); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNewNote, navigate, toggleFocus, toggleTheme, back, forward]);

  function newChat() {
    chatStore.reset();
    setCurrentChatId(null);
    setChatTitle('New Conversation');
  }

  async function loadChat(sessionId: string) {
    try {
      const session = await apiGet<{
        id: string; title: string;
        messages: Array<{ role: string; text: string; citations?: Array<{ path: string; title: string }> }>;
      }>(`/chats/${sessionId}`);
      chatStore.reset();
      for (const m of session.messages) {
        if (m.role === 'user') chatStore.addUser(m.text);
        else {
          const id = chatStore.addAssistant();
          chatStore.appendDelta(id, m.text);
          chatStore.finish(id, m.citations ?? []);
        }
      }
      setCurrentChatId(sessionId);
      setChatTitle(session.title ?? 'Untitled');
    } catch { /* ignore */ }
  }

  async function deleteChat(sessionId: string) {
    try {
      await fetch(`/api/chats/${sessionId}`, { method: 'DELETE' });
      if (currentChatId === sessionId) newChat();
    } catch { /* ignore */ }
  }

  // Listen for milkdown wikilink clicks (dispatched by LivePreviewEditor's
  // ProseMirror plugin). Without this, clicking [[some-slug]] in any
  // editor instance is a dead end. raw:<id> targets get routed to the
  // raw doc viewer; everything else opens as a note (server falls back
  // across the concepts/ ↔ notes/ layers).
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ slug?: string; newTab?: boolean }>).detail;
      const target = detail?.slug?.trim();
      if (!target) return;
      // _newTab is read by page-tabs-sync to decide between active-tab swap vs
      // new-tab create. Side-channel on the route object since CanvasRoute is
      // a discriminated union we don't want to widen for one flag.
      const newTab = !!detail?.newTab;
      const rawMatch = target.match(/^raw:([a-z0-9-]+)$/i);
      if (rawMatch) {
        const route: import('./store/canvas-route').CanvasRoute & { _newTab?: boolean } =
          { kind: 'raw', rawId: rawMatch[1]! };
        if (newTab) route._newTab = true;
        navigate(route);
        return;
      }
      // Normalize: lower-case slug; strip non-[a-z0-9-]
      const slug = target.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-');
      if (!slug) return;
      // TODO(v2): milkdown wikilinks lack category — default research per Phase E.
      const route: import('./store/canvas-route').CanvasRoute & { _newTab?: boolean } =
        { kind: 'note', slug, path: `${slug}.md`, category: 'research', autofocus: false };
      if (newTab) route._newTab = true;
      navigate(route);
    }
    document.addEventListener('milkdown:wikilink-click', handler as EventListener);
    return () => document.removeEventListener('milkdown:wikilink-click', handler as EventListener);
  }, [navigate]);

  function syncDrive() {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    import('./lib/api').then(({ apiSSE }) => {
      apiSSE('/google/sync', {}, (event) => {
        if (event.kind === 'done') {
          const e = event as unknown as { imported: number; skipped: number };
          setSyncResult(`${e.imported} imported, ${e.skipped} skipped`);
          setSyncing(false);
          onWikiChanged();
        } else if (event.kind === 'error') {
          setSyncResult(`Error: ${event.error}`);
          setSyncing(false);
        }
      });
    });
  }

  const callbacks: CanvasCallbacks = {
    // Notion-style: clicking anything opens directly in the editable NotePane.
    // No more Read/Edit dichotomy — the only mode toggle is Rendered vs Source,
    // exposed inside NotePane itself.
    //
    // Phase E (wiki v2): first arg is either a **category** (from
    // CategoryTreeRoot / LeftRail — known values: research, contributors,
    // logs, artifacts, raw, readme, context, soul) or a legacy **slug**
    // (from CommandPalette, ChatMessage citations, GraphView, etc.).
    // Legacy slug + `wiki/notes/<slug>.md` path is normalized to
    // `{ category: 'research', path: '<slug>.md' }`.
    onOpenArticle: (categoryOrSlug, path, _startEditing) => {
      const norm = normalizeArticleRoute(categoryOrSlug, path);
      navigate({ kind: 'note', slug: norm.slug, path: norm.path, category: norm.category, autofocus: false });
    },
    onOpenRaw: (rawId) => navigate({ kind: 'raw', rawId }),
    onOpenNote: (categoryOrSlug, path, autofocus) => {
      const norm = normalizeArticleRoute(categoryOrSlug, path);
      navigate({ kind: 'note', slug: norm.slug, path: norm.path, category: norm.category, autofocus });
    },
    onOpenIngest: () => navigate({ kind: 'ingest' }),
    onOpenSettings: () => navigate({ kind: 'settings' }),
    onOpenHealth: () => navigate({ kind: 'health' }),
    onOpenDevices: () => navigate({ kind: 'devices' }),
    onOpenInbox: () => navigate({ kind: 'inbox' }),
    onOpenReview: () => navigate({ kind: 'review' }),
    onOpenGraph: () => navigate({ kind: 'graph' }),
    onLoadChat: loadChat,
    onDeleteChat: deleteChat,
    onNewChat: newChat,
    onWikiChanged,
    wikiReloadKey,
    currentChatId,
    onSyncDrive: syncDrive,
    syncing,
    syncResult,
    googleSyncConfigured: settings.googleConnected && !!settings.googleSyncFolderName,
    onNewNote: handleNewNote,
  };

  return (
    <>
      <AppShell
        callbacks={callbacks}
        chatTitle={chatTitle}
        onOpenSearch={() => setPaletteOpen(true)}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenArticle={(slug, path) => {
          const norm = normalizeArticleRoute(slug, path);
          navigate({ kind: 'note', slug: norm.slug, path: norm.path, category: norm.category, autofocus: false });
        }}
        onLoadChat={(id) => void loadChat(id)}
        onOpenIngest={() => navigate({ kind: 'ingest' })}
        onOpenHealth={() => navigate({ kind: 'health' })}
        onOpenSettings={() => navigate({ kind: 'settings' })}
        onNewChat={newChat}
        onOpenHome={() => navigate({ kind: 'home' })}
        onOpenGraph={() => navigate({ kind: 'graph' })}
        onOpenStream={() => navigate({ kind: 'stream' })}
        onOpenReview={() => navigate({ kind: 'review' })}
        onOpenInbox={() => navigate({ kind: 'inbox' })}
        onOpenTrash={() => navigate({ kind: 'trash' })}
        onOpenAuditLog={() => navigate({ kind: 'audit-log' })}
        onNewNote={handleNewNote}
      />
      <IndexingToast />
      <ToastHost />
      <AddEntryModal
        open={addEntryOpen}
        onClose={() => setAddEntryOpen(false)}
        onDone={() => { setAddEntryOpen(false); onWikiChanged(); }}
      />
      {onboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-sm rounded-xl overflow-hidden"
            style={{ background: 'var(--win-bg)', border: '0.5px solid var(--hairline)', maxHeight: '85vh' }}
          >
            <SetupWizard
              mode="onboarding"
              onComplete={() => setOnboarding(false)}
              onSkip={() => {
                localStorage.setItem('mindbase.onboardingSkipped', '1');
                setOnboarding(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
