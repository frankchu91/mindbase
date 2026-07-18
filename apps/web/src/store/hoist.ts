import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TreeNodeId } from '@mindbase/core';

interface HoistState {
  hoistedRoot: TreeNodeId | null;
  hoistedLabel: string | null;
  hoist(id: TreeNodeId, label: string): void;
  exit(): void;
}

export const useHoistStore = create<HoistState>()(
  persist(
    (set) => ({
      hoistedRoot: null,
      hoistedLabel: null,
      hoist(id, label) {
        set({ hoistedRoot: id, hoistedLabel: label });
      },
      exit() {
        set({ hoistedRoot: null, hoistedLabel: null });
      },
    }),
    { name: 'mindbase.hoist' },
  ),
);
