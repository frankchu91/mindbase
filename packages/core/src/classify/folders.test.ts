import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { loadFolders, saveFolders, ensureInbox, INBOX_PATH, isValidFolderPath } from './folders';

describe('folder storage', () => {
  it('ensureInbox writes a default folders.json containing inbox when missing', async () => {
    const store = new MemoryStore();
    await ensureInbox(store);
    const folders = await loadFolders(store);
    expect(folders.length).toBe(1);
    expect(folders[0]!.path).toBe(INBOX_PATH);
    expect(folders[0]!.name).toBe('Inbox');
  });

  it('ensureInbox is idempotent — adds inbox once even when called twice', async () => {
    const store = new MemoryStore();
    await ensureInbox(store);
    await ensureInbox(store);
    const folders = await loadFolders(store);
    expect(folders.filter((f) => f.path === INBOX_PATH).length).toBe(1);
  });

  it('saveFolders + loadFolders round-trip preserves order and fields', async () => {
    const store = new MemoryStore();
    const list = [
      { path: 'inbox', name: 'Inbox', created_at: '2026-05-23T00:00:00Z' },
      { path: 'journal', name: '日记', created_at: '2026-05-23T00:01:00Z' },
      { path: 'knowledge/ml', name: '机器学习', created_at: '2026-05-23T00:02:00Z' },
    ];
    await saveFolders(store, list);
    const back = await loadFolders(store);
    expect(back).toEqual(list);
  });

  it('isValidFolderPath accepts slug-safe and slash-separated paths', () => {
    expect(isValidFolderPath('inbox')).toBe(true);
    expect(isValidFolderPath('knowledge/ml')).toBe(true);
    expect(isValidFolderPath('a/b/c/d/e')).toBe(true);
  });

  it('isValidFolderPath rejects uppercase, spaces, leading/trailing/double slashes, empty segments', () => {
    expect(isValidFolderPath('Inbox')).toBe(false);
    expect(isValidFolderPath('my folder')).toBe(false);
    expect(isValidFolderPath('/inbox')).toBe(false);
    expect(isValidFolderPath('inbox/')).toBe(false);
    expect(isValidFolderPath('a//b')).toBe(false);
    expect(isValidFolderPath('')).toBe(false);
  });
});
