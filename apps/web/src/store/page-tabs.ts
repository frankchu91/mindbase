// apps/web/src/store/page-tabs.ts
//
// Obsidian-style page tabs. A tab holds a page-like CanvasRoute (article /
// note / raw) plus a display title. The active tab's route is the source of
// truth for what the Canvas renders. Non-page routes (settings, graph,
// stream, etc.) bypass the tab system entirely — they're full-canvas
// overlays that pause the active tab without closing it.
//
// Persistence: tabs and activeTabId are restored from localStorage on boot
// so the user reopens to the exact pages they left.
import { create } from 'zustand';
import type { CanvasRoute } from './canvas-route';

export type PageRoute = Extract<CanvasRoute, { kind: 'article' | 'note' | 'raw' }>;

export interface PageTab {
  id: string;
  route: PageRoute;
  title: string;
}

interface PageTabsState {
  tabs: PageTab[];
  activeTabId: string | null;
  /** Open the page in a new tab. If already open, just switch to it. */
  openInNewTab: (route: PageRoute, title: string) => void;
  /** Replace the active tab's content. If no active tab, opens a new one. */
  openInActiveTab: (route: PageRoute, title: string) => void;
  closeTab: (id: string) => void;
  switchTo: (id: string) => void;
  updateTitle: (id: string, title: string) => void;
}

const STORAGE_KEY = 'mindbase.page-tabs.v1';

interface PersistedState {
  tabs: PageTab[];
  activeTabId: string | null;
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tabs: [], activeTabId: null };
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.tabs)) return { tabs: [], activeTabId: null };
    return { tabs: parsed.tabs, activeTabId: parsed.activeTabId ?? null };
  } catch {
    return { tabs: [], activeTabId: null };
  }
}

function persist(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota, etc. — ignore */ }
}

function routeKey(route: PageRoute): string {
  switch (route.kind) {
    case 'article': return `article:${route.slug}`;
    case 'note': return `note:${route.slug}`;
    case 'raw': return `raw:${route.rawId}`;
  }
}

function freshId(): string {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const initial = load();

export const usePageTabs = create<PageTabsState>((set, get) => ({
  tabs: initial.tabs,
  activeTabId: initial.activeTabId,

  openInNewTab: (route, title) => {
    const { tabs } = get();
    const key = routeKey(route);
    const existing = tabs.find((t) => routeKey(t.route) === key);
    if (existing) {
      set({ activeTabId: existing.id });
      persist({ tabs, activeTabId: existing.id });
      return;
    }
    const next: PageTab = { id: freshId(), route, title };
    const nextTabs = [...tabs, next];
    set({ tabs: nextTabs, activeTabId: next.id });
    persist({ tabs: nextTabs, activeTabId: next.id });
  },

  openInActiveTab: (route, title) => {
    const { tabs, activeTabId } = get();
    const key = routeKey(route);
    const existing = tabs.find((t) => routeKey(t.route) === key);
    if (existing) {
      set({ activeTabId: existing.id });
      persist({ tabs, activeTabId: existing.id });
      return;
    }
    if (activeTabId) {
      const nextTabs = tabs.map((t) => (t.id === activeTabId ? { ...t, route, title } : t));
      set({ tabs: nextTabs });
      persist({ tabs: nextTabs, activeTabId });
      return;
    }
    // No active tab — open a new one.
    const next: PageTab = { id: freshId(), route, title };
    const nextTabs = [...tabs, next];
    set({ tabs: nextTabs, activeTabId: next.id });
    persist({ tabs: nextTabs, activeTabId: next.id });
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const nextTabs = tabs.filter((t) => t.id !== id);
    let nextActive = activeTabId;
    if (activeTabId === id) {
      // Pick the neighbor that was visually closer (prefer right, then left).
      nextActive = nextTabs[idx]?.id ?? nextTabs[idx - 1]?.id ?? null;
    }
    set({ tabs: nextTabs, activeTabId: nextActive });
    persist({ tabs: nextTabs, activeTabId: nextActive });
  },

  switchTo: (id) => {
    const { tabs } = get();
    if (!tabs.some((t) => t.id === id)) return;
    set({ activeTabId: id });
    persist({ tabs, activeTabId: id });
  },

  updateTitle: (id, title) => {
    const { tabs, activeTabId } = get();
    const nextTabs = tabs.map((t) => (t.id === id ? { ...t, title } : t));
    set({ tabs: nextTabs });
    persist({ tabs: nextTabs, activeTabId });
  },
}));

export function isPageRoute(route: CanvasRoute): route is PageRoute {
  return route.kind === 'article' || route.kind === 'note' || route.kind === 'raw';
}
