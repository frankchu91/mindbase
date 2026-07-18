import type { Store } from '../storage/store';
import type { MetaJson } from '../types';
import { listAllWikiPages } from '../storage/paths';

export const SAMPLES_PER_FOLDER = 10;

/**
 * Walks all notes under wiki/notes/ and groups note titles by their `folder` field.
 * Each folder gets up to SAMPLES_PER_FOLDER titles, most-recently-updated first.
 * Notes with folder=null are excluded — they show up in Inbox anyway, sampling
 * them as "examples of how Inbox is used" defeats the purpose.
 */
export async function sampleNotesPerFolder(store: Store): Promise<Map<string, string[]>> {
  const grouped = new Map<string, { title: string; updated: string }[]>();
  const entries = await listAllWikiPages(store);
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.meta.json')) continue;
    let meta: MetaJson;
    try {
      meta = await store.readJSON<MetaJson>(`wiki/${entry.layer}/${entry.name}`);
    } catch { continue; }
    const folder = meta.folder;
    if (folder == null) continue;
    const bucket = grouped.get(folder) ?? [];
    bucket.push({ title: meta.title, updated: meta.updated });
    grouped.set(folder, bucket);
  }
  const result = new Map<string, string[]>();
  for (const [folder, items] of grouped.entries()) {
    items.sort((a, b) => b.updated.localeCompare(a.updated));
    result.set(folder, items.slice(0, SAMPLES_PER_FOLDER).map((x) => x.title));
  }
  return result;
}
