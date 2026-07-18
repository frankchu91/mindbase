import { create } from 'zustand';

interface NoteTitleCache {
  titles: Record<string, string>;
  set(slug: string, title: string): void;
  get(slug: string): string | undefined;
}

export const useNoteTitleCache = create<NoteTitleCache>((set, get) => ({
  titles: {},
  set(slug, title) {
    if (!title) return;
    const current = get().titles[slug];
    if (current === title) return;
    set((s) => ({ titles: { ...s.titles, [slug]: title } }));
  },
  get(slug) {
    return get().titles[slug];
  },
}));
