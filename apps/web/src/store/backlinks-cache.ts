import { create } from 'zustand';

interface BacklinksCache {
  counts: Record<string, number>;
  set(slug: string, count: number): void;
  get(slug: string): number | undefined;
}

/**
 * Side-channel: BacklinksPanel writes its count here when its fetch lands.
 * The RightRail tab strip reads from here so the "Backlinks · N" label can
 * appear without forcing the panel to mount up-front.
 *
 * Note: this is not persisted — recomputed each session as panels mount.
 */
export const useBacklinksCache = create<BacklinksCache>((set, get) => ({
  counts: {},
  set(slug, count) {
    const current = get().counts[slug];
    if (current === count) return;
    set((s) => ({ counts: { ...s.counts, [slug]: count } }));
  },
  get(slug) {
    return get().counts[slug];
  },
}));
