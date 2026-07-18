import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TreeNodeId } from '@mindbase/core';

/** Local copy of encodeNodeId to avoid value-import from @mindbase/core (breaks Vite). */
function encodeNodeId(id: TreeNodeId): string {
  return id.kind === 'note' ? `note:${id.slug}` : `folder:${id.path}`;
}

interface TreeState {
  /** Serialized node-id strings (e.g. "folder:inbox") that are expanded. */
  expandedSet: string[];
  /** Currently selected node id (encoded as string). null = none selected. */
  selectedEncoded: string | null;
  toggleExpand(id: TreeNodeId): void;
  expand(id: TreeNodeId): void;
  collapse(id: TreeNodeId): void;
  isExpanded(id: TreeNodeId): boolean;
  setSelected(id: TreeNodeId | null): void;
  selectedEquals(id: TreeNodeId): boolean;
}

export const useTreeStore = create<TreeState>()(
  persist(
    (set, get) => ({
      expandedSet: ['folder:inbox'],
      selectedEncoded: null,
      toggleExpand(id) {
        const key = encodeNodeId(id);
        const cur = new Set(get().expandedSet);
        if (cur.has(key)) cur.delete(key);
        else cur.add(key);
        set({ expandedSet: [...cur] });
      },
      expand(id) {
        const key = encodeNodeId(id);
        const cur = new Set(get().expandedSet);
        if (!cur.has(key)) {
          cur.add(key);
          set({ expandedSet: [...cur] });
        }
      },
      collapse(id) {
        const key = encodeNodeId(id);
        const cur = new Set(get().expandedSet);
        if (cur.has(key)) {
          cur.delete(key);
          set({ expandedSet: [...cur] });
        }
      },
      isExpanded(id) {
        return get().expandedSet.includes(encodeNodeId(id));
      },
      setSelected(id) {
        set({ selectedEncoded: id ? encodeNodeId(id) : null });
      },
      selectedEquals(id) {
        const s = get().selectedEncoded;
        if (!s) return false;
        return s === encodeNodeId(id);
      },
    }),
    {
      name: 'mindbase.tree',
      partialize: (s) => ({ expandedSet: s.expandedSet }),
    },
  ),
);
