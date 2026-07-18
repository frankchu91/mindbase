import { useCanvasRoute, type CanvasRoute } from '../../store/canvas-route';
import { useNoteTitleCache } from '../../store/note-titles';
import { CanvasToolbar, breadcrumbFor } from './CanvasToolbar';
import { StreamView } from './StreamView';
import { PageTabStrip } from './PageTabStrip';
import { ProjectDashboard } from '../dashboard/ProjectDashboard';
import { WikiHome } from '../WikiHome';
import { ArticleView } from '../ArticleView';
import { NotePane } from '../NotePane';
import { GraphView } from '../GraphView';
import { ReviewView } from '../ReviewView';
import { SettingsScreen } from '../SettingsScreen';
import { InboxPage } from '../InboxPage';
import { WikiHealthView } from '../WikiHealthView';
import { DevicesPage } from '../DevicesPage';
import { IngestForm } from '../IngestForm';
import { RawSourceView } from '../RawSourceView';
import { CompileHistoryView } from '../CompileHistoryView';
import { TrashView } from '../TrashView';
import { CompileProgressView } from '../CompileProgressView';

export interface CanvasCallbacks {
  // Surface callbacks — all funnel into canvas-route navigation.
  onOpenArticle: (slug: string, path: string, startEditing?: boolean) => void;
  onOpenRaw: (rawId: string) => void;
  onOpenNote: (slug: string, path: string, autofocus?: boolean) => void;
  onOpenIngest: () => void;
  onOpenSettings: () => void;
  onOpenHealth: () => void;
  onOpenDevices: () => void;
  onOpenInbox: () => void;
  onOpenReview: () => void;
  onOpenGraph: () => void;
  // Chat / sync / new-note callbacks passed down to LeftRail + AppShell.
  onLoadChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onNewChat: () => void;
  onWikiChanged: () => void;
  wikiReloadKey: number;
  currentChatId: string | null;
  onSyncDrive: () => void;
  syncing: boolean;
  syncResult: string | null;
  googleSyncConfigured: boolean;
  onNewNote: () => void;
}

interface CanvasProps {
  callbacks: CanvasCallbacks;
}

export function Canvas({ callbacks }: CanvasProps) {
  const route = useCanvasRoute((s) => s.route);
  const replace = useCanvasRoute((s) => s.replace);
  // Read the cached human title for note routes so the breadcrumb shows
  // "Notes › Mindbase development journey" instead of "Notes › untitled-…-1234".
  const cachedTitle = useNoteTitleCache((s) =>
    route.kind === 'note' ? s.titles[route.slug] : undefined,
  );
  const breadcrumb = breadcrumbFor(route, { noteTitle: cachedTitle });
  const cb = callbacks;

  // Build mode toggle options for article view.
  const articleMode = route.kind === 'article' ? (route.mode ?? 'read') : undefined;
  const articleModeOptions = route.kind === 'article' ? (['read', 'edit'] as const) : undefined;
  const handleModeChange = (m: 'read' | 'edit' | 'graph') => {
    if (route.kind !== 'article') return;
    if (m === 'graph') return; // future
    replace({ ...route, mode: m });
  };

  return (
    <main
      className="flex-1 flex flex-col overflow-hidden"
      style={{ background: 'var(--canvas-bg)' }}
      data-testid="canvas"
    >
      <CanvasToolbar
        breadcrumb={breadcrumb}
        mode={articleMode}
        modeOptions={articleModeOptions ? [...articleModeOptions] : undefined}
        onModeChange={articleMode ? handleModeChange : undefined}
      />
      <PageTabStrip />
      <div className="flex-1 overflow-hidden">
        {renderSurface(route, cb)}
      </div>
    </main>
  );
}

function renderSurface(route: CanvasRoute, cb: CanvasCallbacks): React.ReactNode {
  switch (route.kind) {
    case 'home':
      // Wiki-as-main-surface (Option A): the home of MindBase is INDEX.md
      // rendered as a real markdown page with navigable wikilinks, plus a
      // compact stats bar above. The old ProjectDashboard moves under the
      // 'dashboard' route, accessible via a dock item.
      return <WikiHome />;
    case 'dashboard':
      return <ProjectDashboard onOpenArticle={cb.onOpenArticle} onOpenReview={cb.onOpenReview} />;

    case 'article':
      return (
        <ArticleView
          category={route.category ?? 'research'}
          path={route.path}
          onBack={() => useCanvasRoute.getState().back()}
          onOpenArticle={cb.onOpenArticle}
          startEditing={route.mode === 'edit'}
          onOpenRaw={cb.onOpenRaw}
          onWikiChanged={cb.onWikiChanged}
        />
      );

    case 'raw':
      return (
        <RawSourceView
          rawId={route.rawId}
          onBack={() => useCanvasRoute.getState().back()}
          // TODO(v2): raw-source concept links carry no category — default research.
          onOpenConcept={(slug) => cb.onOpenArticle('research', `${slug}.md`)}
        />
      );

    case 'note':
      return (
        <NotePane
          category={route.category ?? 'research'}
          path={route.path}
          autofocus={route.autofocus}
          onClose={() => useCanvasRoute.getState().back()}
          onWikiChanged={cb.onWikiChanged}
          onOpenArticle={(category, path) => cb.onOpenNote(category, path, false)}
        />
      );

    case 'graph': return <GraphView onBack={() => useCanvasRoute.getState().back()} onOpenArticle={cb.onOpenArticle} />;
    case 'review': return <ReviewView onBack={() => useCanvasRoute.getState().back()} onOpenArticle={cb.onOpenArticle} />;
    case 'settings': return <SettingsScreen onClose={() => useCanvasRoute.getState().back()} />;
    case 'inbox': return <InboxPage onBack={() => useCanvasRoute.getState().back()} onOpenArticle={cb.onOpenArticle} />;
    case 'health': return <WikiHealthView onBack={() => useCanvasRoute.getState().back()} onWikiChanged={cb.onWikiChanged} />;
    case 'devices': return <DevicesPage onBack={() => useCanvasRoute.getState().back()} />;
    case 'ingest': return <IngestForm onBack={() => useCanvasRoute.getState().back()} onIngested={() => { useCanvasRoute.getState().back(); cb.onWikiChanged(); }} />;
    case 'stream': return <StreamView />;
    case 'audit-log':
    case 'audit-log-detail':
      return <CompileHistoryView />;
    case 'trash':
      return <TrashView wikiReloadKey={cb.wikiReloadKey} onBack={() => useCanvasRoute.getState().back()} onWikiChanged={cb.onWikiChanged} />;
    case 'compile-progress':
      return <CompileProgressView sourceSlug={route.sourceSlug} sourcePath={route.sourcePath} onWikiChanged={cb.onWikiChanged} />;
  }
}
