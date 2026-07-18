import { create } from 'zustand';

interface LiveEditState {
  // Slug of the wiki page currently being written to by the synthesis
  // worker, or null when idle. Future: the synthesis worker pushes here
  // via SSE.
  writingTo: string | null;
  // Optional paragraph-level signal: which paragraph index is mid-stream.
  writingParagraph: number | null;
  setWriting: (slug: string | null, paragraph?: number | null) => void;
  clear: () => void;
}

export const useLiveEdit = create<LiveEditState>((set) => ({
  writingTo: null,
  writingParagraph: null,
  setWriting: (slug, paragraph = null) => set({ writingTo: slug, writingParagraph: paragraph }),
  clear: () => set({ writingTo: null, writingParagraph: null }),
}));
