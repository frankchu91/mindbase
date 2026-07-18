import { create } from 'zustand';

export type CanvasRoute =
  | { kind: 'home' }
  | { kind: 'dashboard' }
  | { kind: 'graph' }
  | { kind: 'stream' }
  | { kind: 'review' }
  | { kind: 'settings' }
  | { kind: 'inbox' }
  | { kind: 'health' }
  | { kind: 'devices' }
  | { kind: 'ingest' }
  // Phase E (wiki v2): article/note routes carry both `slug` (for
  // graph-index-keyed subcomponents like backlinks / mini-graph / network)
  // and `path` under a tree `category` (research / contributors / logs / …).
  // `category` defaults to `research` for legacy callers that only carry a
  // slug (CommandPalette, GraphView, TodaysBriefCard, ChatMessage citations).
  | { kind: 'article'; slug: string; path: string; category?: string; mode?: 'read' | 'edit' }
  | { kind: 'raw'; rawId: string }
  | { kind: 'note'; slug: string; path: string; category?: string; autofocus?: boolean }
  | { kind: 'audit-log' }
  | { kind: 'audit-log-detail'; id: number }
  | { kind: 'trash' }
  | { kind: 'compile-progress'; sourceSlug: string; sourcePath: string };

interface CanvasRouteState {
  route: CanvasRoute;
  history: CanvasRoute[];
  forwardStack: CanvasRoute[];
  pinned: boolean;
  navigate: (route: CanvasRoute) => void;
  back: () => void;
  forward: () => void;
  canBack: () => boolean;
  canForward: () => boolean;
  togglePin: () => void;
  replace: (route: CanvasRoute) => void;
}

function sameRoute(a: CanvasRoute, b: CanvasRoute): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'article' && b.kind === 'article') return a.slug === b.slug;
  if (a.kind === 'note' && b.kind === 'note') return a.slug === b.slug;
  if (a.kind === 'raw' && b.kind === 'raw') return a.rawId === b.rawId;
  if (a.kind === 'compile-progress' && b.kind === 'compile-progress') return a.sourceSlug === b.sourceSlug;
  return true;
}

export const useCanvasRoute = create<CanvasRouteState>((set, get) => ({
  route: { kind: 'home' },
  history: [],
  forwardStack: [],
  pinned: false,
  navigate: (route) => {
    const { route: current, history, pinned } = get();
    if (pinned) return; // Pinned canvas ignores navigation requests.
    if (sameRoute(current, route)) return;
    set({
      route,
      history: [...history, current],
      forwardStack: [],
    });
  },
  back: () => {
    const { route, history, forwardStack } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1]!;
    set({
      route: prev,
      history: history.slice(0, -1),
      forwardStack: [route, ...forwardStack],
    });
  },
  forward: () => {
    const { route, history, forwardStack } = get();
    if (forwardStack.length === 0) return;
    const next = forwardStack[0]!;
    set({
      route: next,
      history: [...history, route],
      forwardStack: forwardStack.slice(1),
    });
  },
  canBack: () => get().history.length > 0,
  canForward: () => get().forwardStack.length > 0,
  togglePin: () => set({ pinned: !get().pinned }),
  // `replace` overwrites current route without touching history — used by the
  // article-edit mode toggle, which is a no-op navigation-wise.
  replace: (route) => set({ route }),
}));
