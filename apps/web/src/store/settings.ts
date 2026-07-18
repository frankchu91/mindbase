import { create } from 'zustand';
import type { ProviderName } from '@mindbase/core';
import { apiGet } from '../lib/api';

interface AtlasConfig {
  provider: ProviderName;
  model: string;
  apiKey: string;
  baseUrl: string;
  autoSave: boolean;
  mergeSaves: boolean;
}

interface SettingsState extends AtlasConfig {
  loaded: boolean;
  setAll: (config: AtlasConfig) => void;
  setProvider: (p: ProviderName) => void;
  setModel: (m: string) => void;
  setApiKey: (k: string) => void;
  setBaseUrl: (u: string) => void;
  setAutoSave: (v: boolean) => void;
  setMergeSaves: (v: boolean) => void;
  loadFromServer: () => Promise<void>;
  isConfigured: () => boolean;
  googleConnected: boolean;
  googleSyncFolderName: string | null;
  checkGoogleStatus: () => Promise<void>;
}

export const useSettings = create<SettingsState>((set) => ({
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: '',
  baseUrl: '',
  autoSave: true,
  mergeSaves: false,
  loaded: false,
  setAll: (config) => set({ ...config, loaded: true }),
  setProvider: (provider) => set({ provider }),
  setModel: (model) => set({ model }),
  setApiKey: (apiKey) => set({ apiKey }),
  setBaseUrl: (baseUrl) => set({ baseUrl }),
  setAutoSave: (autoSave) => set({ autoSave }),
  setMergeSaves: (mergeSaves) => set({ mergeSaves }),
  loadFromServer: async () => {
    try {
      const config = await apiGet<AtlasConfig>('/config');
      set({ ...config, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  isConfigured: (): boolean => {
    const s: SettingsState = useSettings.getState();
    return s.loaded && !!s.model && (!!s.apiKey || !!s.baseUrl);
  },
  googleConnected: false,
  googleSyncFolderName: null,
  checkGoogleStatus: async () => {
    try {
      const r = await apiGet<{ connected: boolean }>('/google/auth/status');
      set({ googleConnected: r.connected });
    } catch {
      set({ googleConnected: false });
    }
  },
}));
