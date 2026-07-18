export interface Settings {
  serverUrl: string;
  token: string | null;
  deviceId: string | null;
}

const KEY = 'mindbase.settings';

const DEFAULTS: Settings = {
  serverUrl: 'http://localhost:4321',
  token: null,
  deviceId: null,
};

export async function loadSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(KEY);
  return { ...DEFAULTS, ...(r[KEY] ?? {}) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}
