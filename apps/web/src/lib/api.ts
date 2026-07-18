import type { QAEvent } from '@mindbase/core';

const BASE = '';

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`API ${r.status}: ${body}`);
  }
  return r.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`API ${r.status}: ${text}`);
  }
  return r.json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, { method: 'DELETE' });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`API ${r.status}: ${body}`);
  }
  return r.json();
}

export async function apiPostFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${BASE}/api${path}`, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

export function apiSSE(
  path: string,
  body: unknown,
  onEvent: (event: QAEvent) => void,
): { cancel: () => void } {
  const controller = new AbortController();

  (async () => {
    const r = await fetch(`${BASE}/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!r.ok || !r.body) {
      onEvent({ kind: 'error', error: `HTTP ${r.status}` });
      return;
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        try {
          const event = JSON.parse(payload) as QAEvent;
          onEvent(event);
        } catch { /* skip malformed */ }
      }
    }
  })().catch((e) => {
    if (controller.signal.aborted) return;
    onEvent({ kind: 'error', error: (e as Error).message });
  });

  return { cancel: () => controller.abort() };
}
