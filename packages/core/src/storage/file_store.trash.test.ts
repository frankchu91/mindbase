import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileStore } from './file_store';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('FileStore — trash semantics', () => {
  let store: FileStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `mb-trash-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
    store = new FileStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('moveToTrash moves files and writes a manifest', async () => {
    await store.writeText('wiki/notes/foo.md', '# Foo');
    await store.writeText('wiki/notes/foo.meta.json', '{"title":"Foo"}');

    const entry = await store.moveToTrash(['wiki/notes/foo.md', 'wiki/notes/foo.meta.json']);

    // Original files should be gone
    expect(await store.exists('wiki/notes/foo.md')).toBe(false);
    expect(await store.exists('wiki/notes/foo.meta.json')).toBe(false);

    // Entry should have both files
    expect(entry.files).toHaveLength(2);
    expect(entry.files.map((f) => f.originalPath)).toContain('wiki/notes/foo.md');
    expect(entry.files.map((f) => f.originalPath)).toContain('wiki/notes/foo.meta.json');
    expect(entry.id).toBeTruthy();
    expect(entry.deletedAt).toBeTruthy();

    // Manifest should be written on disk
    const manifestPath = path.join(tmpDir, '.trash', entry.id, 'manifest.json');
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.id).toBe(entry.id);
    expect(parsed.files).toHaveLength(2);
  });

  it('moveToTrash skips files that do not exist (e.g. missing meta.json)', async () => {
    await store.writeText('wiki/notes/bar.md', '# Bar');
    // bar.meta.json intentionally not created

    const entry = await store.moveToTrash(['wiki/notes/bar.md', 'wiki/notes/bar.meta.json']);

    // Only the .md file should appear in the entry
    expect(entry.files).toHaveLength(1);
    expect(entry.files[0]!.originalPath).toBe('wiki/notes/bar.md');
  });

  it('restoreFromTrash puts files back at original paths', async () => {
    await store.writeText('wiki/notes/baz.md', '# Baz');
    const entry = await store.moveToTrash(['wiki/notes/baz.md']);

    const result = await store.restoreFromTrash(entry.id);

    expect(result.restored).toContain('wiki/notes/baz.md');
    expect(result.skipped).toHaveLength(0);
    expect(await store.readText('wiki/notes/baz.md')).toBe('# Baz');
    // Trash entry dir should be removed
    const entryDir = path.join(tmpDir, '.trash', entry.id);
    await expect(fs.access(entryDir)).rejects.toThrow();
  });

  it('listTrash returns entries in newest-first order', async () => {
    await store.writeText('wiki/notes/a.md', 'A');
    const e1 = await store.moveToTrash(['wiki/notes/a.md']);

    // Small pause to ensure different timestamps
    await new Promise((r) => setTimeout(r, 5));

    await store.writeText('wiki/notes/b.md', 'B');
    const e2 = await store.moveToTrash(['wiki/notes/b.md']);

    const entries = await store.listTrash();
    expect(entries.length).toBeGreaterThanOrEqual(2);
    // Newest (e2) should be first
    const ids = entries.map((e) => e.id);
    expect(ids.indexOf(e2.id)).toBeLessThan(ids.indexOf(e1.id));
  });

  it('permanentlyDelete removes the entry dir', async () => {
    await store.writeText('wiki/notes/gone.md', 'Gone');
    const entry = await store.moveToTrash(['wiki/notes/gone.md']);

    await store.permanentlyDelete(entry.id);

    const entryDir = path.join(tmpDir, '.trash', entry.id);
    await expect(fs.access(entryDir)).rejects.toThrow();
  });

  it('permanentlyDelete throws for non-existent entry id', async () => {
    await expect(store.permanentlyDelete('non-existent-entry-id')).rejects.toThrow('Trash entry not found');
  });

  it('restoreFromTrash throws for non-existent entry id', async () => {
    await expect(store.restoreFromTrash('non-existent-id')).rejects.toThrow('Trash entry not found');
  });

  it('restoreFromTrash skips files that already exist at the original path (collision)', async () => {
    await store.writeText('wiki/notes/col.md', 'Original');
    const entry = await store.moveToTrash(['wiki/notes/col.md']);

    // Re-create the file at original path to simulate collision
    await store.writeText('wiki/notes/col.md', 'New version');

    const result = await store.restoreFromTrash(entry.id);
    expect(result.skipped).toContain('wiki/notes/col.md');
    expect(result.restored).toHaveLength(0);

    // Original new version is preserved
    expect(await store.readText('wiki/notes/col.md')).toBe('New version');
  });

  it('emptyTrash removes the entire .trash directory', async () => {
    await store.writeText('wiki/notes/x.md', 'X');
    await store.moveToTrash(['wiki/notes/x.md']);

    await store.emptyTrash();

    const trashDir = path.join(tmpDir, '.trash');
    await expect(fs.access(trashDir)).rejects.toThrow();
  });

  it('listTrash returns empty array when .trash dir does not exist', async () => {
    const entries = await store.listTrash();
    expect(entries).toEqual([]);
  });
});
