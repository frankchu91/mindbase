// apps/web/src/store/page-tabs-sync.ts
//
// Side-effect bridge: every time the user navigates to a page-like route
// (article / note / raw), reflect it in the page-tabs store. Two paths:
//
//   - navigate({ kind: 'article', ... })           — opens-or-switches in
//     ACTIVE tab (Obsidian default for plain click).
//   - navigate({ kind: 'article', ..., _newTab })  — opens in NEW tab when
//     the caller (a Cmd/Ctrl-clicked wikilink) signals intent.
//
// The `_newTab` field is added on the route AT CLICK TIME by handlers and
// stripped here before the route is committed downstream.
import { useEffect } from 'react';
import { useCanvasRoute, type CanvasRoute } from './canvas-route';
import { usePageTabs, isPageRoute } from './page-tabs';

interface RouteWithNewTab {
  _newTab?: boolean;
}

/**
 * Mount this once in App. Subscribes to canvas-route changes and updates the
 * tab store. Also listens for Cmd+W to close the active tab.
 */
export function usePageTabsSync(): void {
  useEffect(() => {
    const unsub = useCanvasRoute.subscribe((state) => {
      const route = state.route;
      if (!isPageRoute(route)) return;
      const { openInNewTab, openInActiveTab } = usePageTabs.getState();
      const wantsNewTab = (route as CanvasRoute & RouteWithNewTab)._newTab === true;
      const title = titleFor(route);
      if (wantsNewTab) openInNewTab(route, title);
      else openInActiveTab(route, title);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        const { activeTabId, closeTab, tabs } = usePageTabs.getState();
        if (!activeTabId || tabs.length === 0) return;
        e.preventDefault();
        const next = tabs.find((t) => t.id !== activeTabId);
        closeTab(activeTabId);
        // After closing, navigate to the new active tab's route (if any).
        if (next) useCanvasRoute.getState().navigate(next.route);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function titleFor(route: ReturnType<typeof useCanvasRoute.getState>['route']): string {
  if (route.kind === 'article') return route.slug;
  if (route.kind === 'note') return route.slug;
  if (route.kind === 'raw') return `raw:${route.rawId}`;
  return '';
}
