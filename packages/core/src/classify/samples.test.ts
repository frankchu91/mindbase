import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import type { MetaJson } from '../types';
import { sampleNotesPerFolder, SAMPLES_PER_FOLDER } from './samples';

async function writeNote(store: MemoryStore, slug: string, title: string, folder: string | null, updated: string) {
  const meta: Partial<MetaJson> = {
    id: slug, type: 'concept', title, created: updated, updated,
    sources: [], related: [], one_liner: '', word_count: 0,
    compile_version: 0, edit_state: 'auto', last_human_edit: null,
    folder, folder_set_by: 'user',
  };
  await store.writeText(`wiki/notes/${slug}.md`, `# ${title}\n`);
  await store.writeJSON(`wiki/notes/${slug}.meta.json`, meta);
}

describe('sampleNotesPerFolder', () => {
  let store: MemoryStore;
  beforeEach(() => { store = new MemoryStore(); });

  it('groups notes by their folder field, ignoring notes with null folder', async () => {
    await writeNote(store, 'a', 'Alpha', 'journal',       '2026-05-23T00:00Z');
    await writeNote(store, 'b', 'Beta',  'knowledge/ml',  '2026-05-23T01:00Z');
    await writeNote(store, 'c', 'Gamma', null,            '2026-05-23T02:00Z');
    const grouped = await sampleNotesPerFolder(store);
    expect(grouped.get('journal')).toEqual(['Alpha']);
    expect(grouped.get('knowledge/ml')).toEqual(['Beta']);
    expect(grouped.has(null as unknown as string)).toBe(false);
  });

  it('returns at most SAMPLES_PER_FOLDER titles per folder, most-recently-updated first', async () => {
    for (let i = 0; i < SAMPLES_PER_FOLDER + 5; i++) {
      await writeNote(store, `n${i}`, `Note ${i}`, 'journal', `2026-05-${String(i + 1).padStart(2, '0')}T00:00Z`);
    }
    const grouped = await sampleNotesPerFolder(store);
    const journal = grouped.get('journal')!;
    expect(journal.length).toBe(SAMPLES_PER_FOLDER);
    // Most recent first
    expect(journal[0]).toBe(`Note ${SAMPLES_PER_FOLDER + 4}`);
    expect(journal[journal.length - 1]).toBe(`Note ${(SAMPLES_PER_FOLDER + 5) - SAMPLES_PER_FOLDER}`);
  });

  it('returns an empty Map when no notes exist', async () => {
    const grouped = await sampleNotesPerFolder(store);
    expect(grouped.size).toBe(0);
  });
});
