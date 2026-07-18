// apps/web/src/lib/notes.ts
//
// Trimmed to only what wiki v2 still needs: raw-doc fetching for RawSourceView
// + the clipboard wikilink helper. All v1 endpoints (/api/wiki/notes, /daily,
// /templates, /bulk-trash) were retired with the wiki v2 refactor.

export interface RawDocFull {
  id: string;
  title: string;
  content: string;
  meta: {
    source_url?: string | null;
    captured_at?: string;
    captured_via?: string;
    [k: string]: unknown;
  };
  has_binary: boolean;
  binary_ext?: string;
  binary_url?: string;
  cited_by_concepts: string[];
}

interface RawListEntry {
  date: string;
  id: string;
  size: number;
  kind: 'binary' | 'text';
}

/**
 * v2 raw-doc fetch: list /api/tree/raw to find the {date} bucket, then read
 * /api/tree/raw/:date/:id for the body. v2 has no metadata sidecar, no
 * cited_by tracking, no title extraction — those fields degrade gracefully.
 */
export async function getRawDoc(id: string): Promise<RawDocFull> {
  const listRes = await fetch('/api/tree/raw');
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
  const list = (await listRes.json()) as { entries: RawListEntry[] };
  const entry = list.entries.find((e) => e.id === id);
  if (!entry) throw new Error('Raw source not found');

  const bodyRes = await fetch(
    `/api/tree/raw/${encodeURIComponent(entry.date)}/${encodeURIComponent(entry.id)}`,
  );
  const body = bodyRes.ok
    ? ((await bodyRes.json()) as { body: string }).body
    : '';

  const ext = (id.split('.').pop() ?? '').toLowerCase();
  const binaryUrl = `/api/tree/raw/${encodeURIComponent(entry.date)}/${encodeURIComponent(entry.id)}/binary`;

  return {
    id,
    title: id,
    content: body,
    meta: {},
    has_binary: entry.kind === 'binary',
    binary_ext: entry.kind === 'binary' ? ext : undefined,
    binary_url: entry.kind === 'binary' ? binaryUrl : undefined,
    cited_by_concepts: [],
  };
}

export async function copyWikilinkToClipboard(slug: string): Promise<void> {
  await navigator.clipboard.writeText(`[[${slug}]]`);
}
