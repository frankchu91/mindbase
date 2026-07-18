import { create } from 'zustand';

export interface ToastEntry {
  id: string;
  message: string;
  kind: 'info' | 'error';
}

interface ToastStore {
  toasts: ToastEntry[];
  showToast: (message: string, kind?: 'info' | 'error') => void;
  dismissToast: (id: string) => void;
}

const TOAST_TTL_MS = 4000;

export const useToast = create<ToastStore>((set, get) => ({
  toasts: [],
  showToast: (message, kind = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, TOAST_TTL_MS);
  },
  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Convenience: imperative call from non-React code (e.g. catch handlers). */
export function showToast(message: string, kind?: 'info' | 'error'): void {
  useToast.getState().showToast(message, kind);
}
