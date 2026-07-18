export interface TrashEntry {
  id: string;
  label: string;
  deletedAt: string;
  files: Array<{
    originalPath: string;
    /** Captured from meta.json at delete time. `note`/`daily`/`meeting` → Notes tab;
     *  `concept`/`person`/`project` → Wiki tab. Absent for raw/legacy entries.
     *  Server normalizes missing kind → 'concept' so old wikis (no kind field)
     *  still land under Wiki, matching listing endpoint behavior. */
    kind?: string;
    /** Captured from meta.json `title` at delete time (or from chat body for
     *  chats). UI uses this in place of slug when present. */
    title?: string;
  }>;
}

export async function listTrash(): Promise<TrashEntry[]> {
  const r = await fetch('/api/trash');
  if (!r.ok) throw new Error('failed to list trash');
  return (await r.json() as { entries: TrashEntry[] }).entries;
}

export async function restoreFromTrash(id: string): Promise<{ restored: string[]; skipped: string[] }> {
  const r = await fetch(`/api/trash/restore/${encodeURIComponent(id)}`, { method: 'POST' });
  if (!r.ok) throw new Error('failed to restore');
  return await r.json() as { restored: string[]; skipped: string[] };
}

export async function permanentlyDelete(id: string): Promise<void> {
  const r = await fetch(`/api/trash/permanent-delete/${encodeURIComponent(id)}`, { method: 'POST' });
  if (!r.ok) throw new Error('failed to permanently delete');
}

export async function emptyTrash(): Promise<void> {
  const r = await fetch('/api/trash/empty', { method: 'POST' });
  if (!r.ok) throw new Error('failed to empty trash');
}
