export interface TrackedCapture {
  id: string;
  title: string;
  url?: string;
  type: 'url' | 'text' | 'image' | 'audio';
  captured_at: string; // ISO when client posted
  status: 'queued' | 'processing' | 'compiled' | 'failed' | 'pending';
  wiki_slug?: string;
  error?: string;
  last_polled_at?: string;
}

const KEY = 'mindbase.captures';
const MAX_HISTORY = 30;

export async function loadCaptures(): Promise<TrackedCapture[]> {
  const r = await chrome.storage.local.get(KEY);
  return (r[KEY] as TrackedCapture[] | undefined) ?? [];
}

export async function saveCaptures(list: TrackedCapture[]): Promise<void> {
  // Keep only the latest MAX_HISTORY; favor in-flight entries first
  const inFlight = list.filter(
    c => c.status === 'queued' || c.status === 'processing' || c.status === 'pending',
  );
  const done = list.filter(c => c.status === 'compiled' || c.status === 'failed');
  const trimmed = [...inFlight, ...done].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ [KEY]: trimmed });
}

export async function upsertCapture(capture: TrackedCapture): Promise<void> {
  const all = await loadCaptures();
  const idx = all.findIndex(c => c.id === capture.id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...capture };
  } else {
    all.unshift(capture); // newest first
  }
  await saveCaptures(all);
}

export function inFlightCount(list: TrackedCapture[]): number {
  return list.filter(
    c => c.status === 'queued' || c.status === 'processing' || c.status === 'pending',
  ).length;
}
