import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentNoteRef {
  slug: string;
  title: string;
  path: string;
  /** ISO timestamp of last access. */
  openedAt: string;
}

interface RecentNotesState {
  /** Most-recently-opened first. Bounded to MAX entries. */
  recent: RecentNoteRef[];
  /** Push a note to the front. Dedupes by slug. */
  push(ref: Omit<RecentNoteRef, 'openedAt'>): void;
  clear(): void;
}

const MAX = 10;

export const useRecentNotes = create<RecentNotesState>()(
  persist(
    (set) => ({
      recent: [],
      push(ref) {
        const now = new Date().toISOString();
        set((s) => {
          const existing = s.recent.filter((r) => r.slug !== ref.slug);
          return { recent: [{ ...ref, openedAt: now }, ...existing].slice(0, MAX) };
        });
      },
      clear() {
        set({ recent: [] });
      },
    }),
    { name: 'mindbase.recentNotes' },
  ),
);
