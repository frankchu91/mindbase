import { loadSettings } from './store';

export interface CapturePayload {
  type: 'url' | 'text' | 'image' | 'audio';
  url?: string;
  title?: string;
  text?: string;
  note?: string;
  tags?: string[];
  client_dedup_key?: string;
  file?: Blob;
}

export async function pair(
  code: string,
  deviceName: string,
): Promise<{ token: string; deviceId: string }> {
  const { serverUrl } = await loadSettings();
  const res = await fetch(`${serverUrl}/api/devices/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, device_name: deviceName, device_type: 'browser-ext' }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ token: string; deviceId: string }>;
}

export async function capture(
  payload: CapturePayload,
): Promise<{ id: string; status: string }> {
  const { serverUrl, token } = await loadSettings();
  if (!token) throw new Error('Not paired — open extension options to pair this browser');
  const url = `${serverUrl}/api/capture`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: BodyInit;
  const captured_at = new Date().toISOString();
  if (payload.file) {
    const fd = new FormData();
    const json = { ...payload, file: undefined, captured_via: 'browser-ext', captured_at };
    fd.append('payload', JSON.stringify(json));
    fd.append('file', payload.file);
    body = fd;
  } else {
    headers['content-type'] = 'application/json';
    body = JSON.stringify({ ...payload, captured_via: 'browser-ext', captured_at });
  }
  const res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  return res.json() as Promise<{ id: string; status: string }>;
}
