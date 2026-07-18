import type { Folder } from '@mindbase/core';

export type { Folder };

export async function getFolders(): Promise<Folder[]> {
  const r = await fetch('/api/folders');
  const d = await r.json() as { folders: Folder[] };
  return d.folders;
}

export async function createFolder(path: string, name: string): Promise<Folder> {
  const r = await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, name }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'create failed');
  return d.folder;
}

export async function renameFolder(path: string, name: string): Promise<void> {
  const r = await fetch(`/api/folders/${encodeURIComponent(path)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? 'rename failed');
}

export async function deleteFolder(path: string): Promise<{ reparentedTo: string }> {
  const r = await fetch(`/api/folders/${encodeURIComponent(path)}`, { method: 'DELETE' });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'delete failed');
  return d;
}

export async function classifyNoteApi(slug: string): Promise<{ folder: string; reason: string }> {
  const r = await fetch(`/api/classify/note/${encodeURIComponent(slug)}`, { method: 'POST' });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'classify failed');
  return d;
}

export async function setNoteFolder(slug: string, folder: string | null): Promise<void> {
  const r = await fetch(`/api/classify/notes/${encodeURIComponent(slug)}/folder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? 'set folder failed');
}

export async function getClassifyRules(): Promise<string> {
  const r = await fetch('/api/classify/rules');
  const d = await r.json() as { content: string };
  return d.content;
}

export async function putClassifyRules(content: string): Promise<void> {
  const r = await fetch('/api/classify/rules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? 'save rules failed');
}

export async function testClassify(slug: string, overrideRules?: string): Promise<{ folder: string; reason: string }> {
  const r = await fetch('/api/classify/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, overrideRules }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'test failed');
  return d;
}

export interface BulkProgressEvent {
  type: 'progress' | 'done';
  payload: { done: number; total: number; errors: number };
}

export async function startBulkClassify(scope: 'unfiled' | 'all'): Promise<string> {
  const r = await fetch('/api/classify/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'bulk start failed');
  return d.jobId;
}

export function streamBulkProgress(jobId: string, onEvent: (e: BulkProgressEvent) => void): () => void {
  const ctl = new AbortController();
  (async () => {
    const response = await fetch(`/api/classify/jobs/${jobId}/stream`, { signal: ctl.signal });
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try { chunk = await reader.read(); } catch { return; }
      if (chunk.done) return;
      buffer += decoder.decode(chunk.value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let evType = '';
        let evData = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) evType = line.slice(7).trim();
          else if (line.startsWith('data: ')) evData += line.slice(6);
        }
        if (!evType) continue;
        try {
          onEvent({ type: evType as BulkProgressEvent['type'], payload: JSON.parse(evData) });
        } catch { /* skip malformed */ }
      }
    }
  })();
  return () => ctl.abort();
}
