import { create } from 'zustand';
import { getFolders, type Folder } from '../lib/folders';

interface FoldersState {
  folders: Folder[];
  loaded: boolean;
  /** Currently selected folder path, or null = "all notes" view */
  selected: string | null;
  refetch: () => Promise<void>;
  setSelected: (path: string | null) => void;
}

export const useFolders = create<FoldersState>((set) => ({
  folders: [],
  loaded: false,
  selected: null,
  refetch: async () => {
    try {
      const folders = await getFolders();
      set({ folders, loaded: true });
    } catch (e) {
      console.error('[folders store] refetch failed:', e);
      set({ loaded: true });
    }
  },
  setSelected: (path) => set({ selected: path }),
}));
