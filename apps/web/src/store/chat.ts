import { create } from 'zustand';

export interface Citation {
  path: string;
  title: string;
}

export interface CitedSource {
  n: number;
  slug: string;
  title: string;
  path: string;
  one_liner: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  sources?: CitedSource[];
  progress?: string[]; // phases seen so far
  /** Live tail of a thinking model's reasoning stream (cleared when the answer starts). */
  thinking?: string | null;
  status: 'idle' | 'streaming' | 'done' | 'error';
  error?: string;
}

interface ChatState {
  messages: ChatMessage[];
  addUser: (text: string) => string;
  addAssistant: () => string;
  appendDelta: (id: string, delta: string) => void;
  addProgress: (id: string, phase: string) => void;
  setThinking: (id: string, text: string | null) => void;
  setSources: (id: string, sources: CitedSource[]) => void;
  finish: (id: string, citations: Citation[], sources?: CitedSource[]) => void;
  fail: (id: string, error: string) => void;
  reset: () => void;
}

function genId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export const useChat = create<ChatState>((set) => ({
  messages: [],
  addUser: (text) => {
    const id = genId();
    set((s) => ({ messages: [...s.messages, { id, role: 'user', text, status: 'done' }] }));
    return id;
  },
  addAssistant: () => {
    const id = genId();
    set((s) => ({
      messages: [
        ...s.messages,
        { id, role: 'assistant', text: '', citations: [], progress: [], status: 'streaming' },
      ],
    }));
    return id;
  },
  appendDelta: (id, delta) =>
    set((s) => ({
      // First answer token also clears the thinking indicator.
      messages: s.messages.map((m) => (m.id === id ? { ...m, text: m.text + delta, thinking: null } : m)),
    })),
  setThinking: (id, text) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, thinking: text } : m)),
    })),
  addProgress: (id, phase) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, progress: [...(m.progress ?? []), phase] } : m,
      ),
    })),
  setSources: (id, sources) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, sources } : m)),
    })),
  finish: (id, citations, sources) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, citations, sources: sources ?? m.sources, status: 'done' } : m,
      ),
    })),
  fail: (id, error) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, status: 'error', error } : m)),
    })),
  reset: () => set({ messages: [] }),
}));
