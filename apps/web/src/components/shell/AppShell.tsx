import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useShellState } from '../../store/shell-state';
import { useCanvasRoute } from '../../store/canvas-route';
import { useChat } from '../../store/chat';
import { useSettings } from '../../store/settings';
import { useProjects } from '../../store/projects';
import { TitleBar } from './TitleBar';
import { LeftRail } from './LeftRail';
import { ChatPane } from './ChatPane';
import { Canvas, type CanvasCallbacks } from './Canvas';
import { StatusBar } from './StatusBar';
import { apiGet } from '../../lib/api';
import { OnboardingWizard } from '../onboarding/OnboardingWizard';

const APP_VERSION = 'v0.4.2';

// ChatPane visibility — hidden on fullscreen views that own the whole canvas
// (graph, settings, etc.), shown elsewhere including the new wiki home.
//
// In the wiki-as-main-surface model, query is one of Karpathy's three core
// operations, so chat lives in the right column as a persistent side panel
// (Notion / Obsidian pattern). The old "hide on home" rule was for when
// home was the Project Dashboard; the new home IS the wiki, so chat shows.
const FULLSCREEN_ROUTES = new Set([
  'graph', 'settings', 'inbox', 'health', 'devices', 'ingest',
  'audit-log', 'audit-log-detail', 'trash', 'compile-progress',
  'dashboard',  // ProjectDashboard moved here; keep chat hidden there as before
]);
function shouldShowChat(kind: string): boolean {
  return !FULLSCREEN_ROUTES.has(kind);
}

interface AppShellProps {
  callbacks: CanvasCallbacks;
  chatTitle: string;
  onOpenSearch: () => void;
}

export function AppShell({ callbacks, chatTitle, onOpenSearch }: AppShellProps) {
  const focusMode = useShellState((s) => s.focusMode);
  const chatCollapsed = useShellState((s) => s.chatCollapsed);
  const toggleChatCollapsed = useShellState((s) => s.toggleChatCollapsed);
  const hasCompletedOnboarding = useShellState((s) => s.hasCompletedOnboarding);
  const navigate = useCanvasRoute((s) => s.navigate);
  const route = useCanvasRoute((s) => s.route);
  const { reset: resetChat } = useChat();
  const settings = useSettings();
  const projects = useProjects((s) => s.projects);

  const [newProjectOpen, setNewProjectOpen] = useState(false);

  useEffect(() => {
    function handler(): void { setNewProjectOpen(true); }
    window.addEventListener('mindbase:open-new-project', handler);
    return () => window.removeEventListener('mindbase:open-new-project', handler);
  }, []);

  useEffect(() => {
    function onOpenRawEvent(e: Event): void {
      const rawId = (e as CustomEvent<string>).detail;
      if (typeof rawId === 'string' && rawId) callbacks.onOpenRaw(rawId);
    }
    window.addEventListener('mindbase:open-raw', onOpenRawEvent);
    return () => window.removeEventListener('mindbase:open-raw', onOpenRawEvent);
  }, [callbacks.onOpenRaw]);

  const showWizard = (!hasCompletedOnboarding && projects.length === 0) || newProjectOpen;

  // ⌘L / Ctrl+L toggles the right ChatPane.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l' && !e.shiftKey && !e.altKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        // Skip when typing in form fields so ⌘L can still navigate URL bar etc. inside iframes.
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        toggleChatCollapsed();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleChatCollapsed]);

  const [counts, setCounts] = useState<{ notes: number | null; wiki: number | null }>({
    notes: null,
    wiki: null,
  });

  useEffect(() => {
    let cancelled = false;
    apiGet<{ counts: { notes: number; wiki: number } }>('/counts')
      .then((r) => { if (!cancelled) setCounts({ notes: r.counts.notes, wiki: r.counts.wiki }); })
      .catch(() => { /* ignore — counts stay null and render as — */ });
    return () => { cancelled = true; };
  }, [callbacks.wikiReloadKey]);

  function onNewChat() {
    resetChat();
    callbacks.onNewChat();
  }

  return (
    <div className="mb-stage" data-testid="mb-stage">
      {showWizard && <OnboardingWizard />}
      <div
        className="mb-window flex flex-col overflow-hidden"
        style={{ background: 'var(--win-bg)' }}
        data-testid="app-shell"
        data-focus-mode={focusMode ? 'on' : 'off'}
      >
        <TitleBar />
        <div className="flex-1 flex overflow-hidden min-h-0">
          {!focusMode && (
            <LeftRail
              wikiReloadKey={callbacks.wikiReloadKey}
              currentChatId={callbacks.currentChatId}
              onOpenArticle={callbacks.onOpenArticle}
              onOpenChat={callbacks.onLoadChat}
              onOpenRaw={callbacks.onOpenRaw}
              onSearch={onOpenSearch}
              onNewNote={callbacks.onNewNote}
              onOpenIngest={callbacks.onOpenIngest}
              onWikiChanged={callbacks.onWikiChanged}
            />
          )}
          <Canvas callbacks={callbacks} />
          {!focusMode && shouldShowChat(route.kind) && !chatCollapsed && (
            <ChatPane
              chatTitle={chatTitle}
              onNewChat={onNewChat}
              onWikiSaved={callbacks.onWikiChanged}
              onOpenArticle={callbacks.onOpenArticle}
              onOpenReview={callbacks.onOpenReview}
            />
          )}
          {!focusMode && shouldShowChat(route.kind) && chatCollapsed && (
            <button
              data-testid="chat-collapse-restore"
              onClick={toggleChatCollapsed}
              title="Show chat (⌘L)"
              className="flex flex-col items-center justify-center gap-1.5 cursor-pointer flex-shrink-0"
              style={{
                width: 28,
                background: 'var(--chat-bg)',
                borderLeft: '0.5px solid var(--hairline)',
                color: 'var(--text-mid)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-high)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-mid)')}
            >
              <MessageSquare size={14} strokeWidth={1.8} />
              <span
                style={{
                  fontSize: 9,
                  fontFamily: '-apple-system, ui-monospace, monospace',
                  color: 'var(--text-faint)',
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                }}
              >
                ⌘L
              </span>
            </button>
          )}
        </div>
        <StatusBar
          notesCount={counts.notes}
          wikiCount={counts.wiki}
          modelName={settings.model || 'unconfigured'}
          appVersion={APP_VERSION}
          lastSyncLabel={null}
          onModelClick={() => navigate({ kind: 'settings' })}
          onVersionClick={() => navigate({ kind: 'settings' })}
        />
      </div>
    </div>
  );
}
