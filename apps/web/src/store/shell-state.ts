import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ShellState {
  theme: Theme;
  focusMode: boolean;
  chatWidth: number;
  leftRailWidth: number;
  rightRailWidth: number;
  chatCollapsed: boolean;
  rightRailOpen: boolean;
  hasCompletedOnboarding: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toggleFocus: () => void;
  toggleChatCollapsed: () => void;
  toggleRightRail: () => void;
  setChatWidth: (w: number) => void;
  setLeftRailWidth: (w: number) => void;
  setRightRailWidth: (w: number) => void;
  setOnboardingComplete(): void;
}

const THEME_KEY = 'mindbase.theme';
const FOCUS_KEY = 'mindbase.focusMode';
const CHAT_WIDTH_KEY = 'mindbase.chatWidth';
const LEFTRAIL_WIDTH_KEY = 'mindbase.leftRailWidth';
const RIGHTRAIL_WIDTH_KEY = 'mindbase.rightRailWidth';
const CHAT_COLLAPSED_KEY = 'mindbase.chatCollapsed';
const LEGACY_THEME_KEY = 'atlas-theme';
const RIGHTRAIL_KEY = 'mindbase.rightRailOpen';
const ONBOARDING_KEY = 'mindbase.onboardingComplete';

const DEFAULT_CHAT_WIDTH = 460;
const MIN_CHAT_WIDTH = 320;
const MAX_CHAT_WIDTH = 720;

const DEFAULT_LEFTRAIL_WIDTH = 240;
const MIN_LEFTRAIL_WIDTH = 180;
const MAX_LEFTRAIL_WIDTH = 420;

const DEFAULT_RIGHTRAIL_WIDTH = 260;
const MIN_RIGHTRAIL_WIDTH = 200;
const MAX_RIGHTRAIL_WIDTH = 480;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function readInitialTheme(): Theme {
  try {
    const next = localStorage.getItem(THEME_KEY);
    if (next === 'light' || next === 'dark') return next;
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === 'light' || legacy === 'dark') {
      localStorage.setItem(THEME_KEY, legacy);
      return legacy;
    }
  } catch { /* ignore */ }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function readInitialChatWidth(): number {
  try {
    const v = localStorage.getItem(CHAT_WIDTH_KEY);
    if (v) return clamp(parseInt(v, 10), MIN_CHAT_WIDTH, MAX_CHAT_WIDTH);
    // Migrate from old left-panel width key — semantically different but a
    // reasonable starting point if a user has customized it.
    const legacy = localStorage.getItem('mindbase.leftWidth');
    if (legacy) return clamp(parseInt(legacy, 10), MIN_CHAT_WIDTH, MAX_CHAT_WIDTH);
  } catch { /* ignore */ }
  return DEFAULT_CHAT_WIDTH;
}

function readInitialLeftRailWidth(): number {
  try {
    const v = localStorage.getItem(LEFTRAIL_WIDTH_KEY);
    if (v) return clamp(parseInt(v, 10), MIN_LEFTRAIL_WIDTH, MAX_LEFTRAIL_WIDTH);
  } catch { /* ignore */ }
  return DEFAULT_LEFTRAIL_WIDTH;
}

function readInitialRightRailWidth(): number {
  try {
    const v = localStorage.getItem(RIGHTRAIL_WIDTH_KEY);
    if (v) return clamp(parseInt(v, 10), MIN_RIGHTRAIL_WIDTH, MAX_RIGHTRAIL_WIDTH);
  } catch { /* ignore */ }
  return DEFAULT_RIGHTRAIL_WIDTH;
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  // Toggle BOTH legacy classes — index.css uses `.light` to override the
  // default (dark) values of legacy variables that PulseHome / ArticleView
  // still reference (--bg-base, --accent-azure, --text-low, …). Without
  // `.light` applied, those components render with low-contrast pale text
  // on a light canvas.
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme === 'light');
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
}

const initialTheme = readInitialTheme();
applyTheme(initialTheme);

const initialFocus = (() => {
  try { return localStorage.getItem(FOCUS_KEY) === '1'; } catch { return false; }
})();

const initialChatCollapsed = (() => {
  try { return localStorage.getItem(CHAT_COLLAPSED_KEY) === '1'; } catch { return false; }
})();

const initialRightRailOpen = (() => {
  try {
    const v = localStorage.getItem(RIGHTRAIL_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* ignore */ }
  if (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1280px)').matches) return true;
  return false;
})();

const initialHasCompletedOnboarding = (() => {
  try { return localStorage.getItem(ONBOARDING_KEY) === '1'; } catch { return false; }
})();

export const useShellState = create<ShellState>((set, get) => ({
  theme: initialTheme,
  focusMode: initialFocus,
  chatWidth: readInitialChatWidth(),
  leftRailWidth: readInitialLeftRailWidth(),
  rightRailWidth: readInitialRightRailWidth(),
  chatCollapsed: initialChatCollapsed,
  rightRailOpen: initialRightRailOpen,
  hasCompletedOnboarding: initialHasCompletedOnboarding,
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    set({ theme: next });
  },
  toggleFocus: () => {
    const next = !get().focusMode;
    try { localStorage.setItem(FOCUS_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    set({ focusMode: next });
  },
  toggleChatCollapsed: () => {
    const next = !get().chatCollapsed;
    try { localStorage.setItem(CHAT_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    set({ chatCollapsed: next });
  },
  toggleRightRail: () => {
    const next = !get().rightRailOpen;
    try { localStorage.setItem(RIGHTRAIL_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    set({ rightRailOpen: next });
  },
  setChatWidth: (w) => {
    const c = clamp(w, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH);
    try { localStorage.setItem(CHAT_WIDTH_KEY, String(c)); } catch { /* ignore */ }
    set({ chatWidth: c });
  },
  setLeftRailWidth: (w) => {
    const c = clamp(w, MIN_LEFTRAIL_WIDTH, MAX_LEFTRAIL_WIDTH);
    try { localStorage.setItem(LEFTRAIL_WIDTH_KEY, String(c)); } catch { /* ignore */ }
    set({ leftRailWidth: c });
  },
  setRightRailWidth: (w) => {
    const c = clamp(w, MIN_RIGHTRAIL_WIDTH, MAX_RIGHTRAIL_WIDTH);
    try { localStorage.setItem(RIGHTRAIL_WIDTH_KEY, String(c)); } catch { /* ignore */ }
    set({ rightRailWidth: c });
  },
  setOnboardingComplete: () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* ignore */ }
    set({ hasCompletedOnboarding: true });
  },
}));

export const CHAT_WIDTH_BOUNDS = { min: MIN_CHAT_WIDTH, max: MAX_CHAT_WIDTH, default: DEFAULT_CHAT_WIDTH };
export const LEFTRAIL_WIDTH_BOUNDS = { min: MIN_LEFTRAIL_WIDTH, max: MAX_LEFTRAIL_WIDTH, default: DEFAULT_LEFTRAIL_WIDTH };
export const RIGHTRAIL_WIDTH_BOUNDS = { min: MIN_RIGHTRAIL_WIDTH, max: MAX_RIGHTRAIL_WIDTH, default: DEFAULT_RIGHTRAIL_WIDTH };
