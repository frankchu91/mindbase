import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from './memory_store';

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('writes and reads a text file', async () => {
    await store.writeText('hello.md', '# Hello');
    const content = await store.readText('hello.md');
    expect(content).toBe('# Hello');
  });

  it('creates parent directories on write', async () => {
    await store.writeText('wiki/concepts/rag.md', 'Content');
    const content = await store.readText('wiki/concepts/rag.md');
    expect(content).toBe('Content');
  });

  it('overwrites existing files', async () => {
    await store.writeText('a.md', 'first');
    await store.writeText('a.md', 'second');
    expect(await store.readText('a.md')).toBe('second');
  });

  it('exists returns true for existing files, false otherwise', async () => {
    await store.writeText('exists.md', 'x');
    expect(await store.exists('exists.md')).toBe(true);
    expect(await store.exists('missing.md')).toBe(false);
  });

  it('exists returns true for directories', async () => {
    await store.writeText('adir/child.md', 'x');
    expect(await store.exists('adir')).toBe(true);
  });

  it('readJSON and writeJSON roundtrip', async () => {
    await store.writeJSON('meta.json', { a: 1, b: 'two' });
    const obj = await store.readJSON<{ a: number; b: string }>('meta.json');
    expect(obj).toEqual({ a: 1, b: 'two' });
  });

  it('listDir returns entries of a directory', async () => {
    await store.writeText('dir/a.md', 'a');
    await store.writeText('dir/b.md', 'b');
    await store.writeText('dir/sub/c.md', 'c');
    const entries = await store.listDir('dir');
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(['a.md', 'b.md', 'sub']);
  });

  it('listDir distinguishes file and directory kind', async () => {
    await store.writeText('dir/a.md', 'a');
    await store.writeText('dir/sub/c.md', 'c');
    const entries = await store.listDir('dir');
    const file = entries.find((e) => e.name === 'a.md');
    const sub = entries.find((e) => e.name === 'sub');
    expect(file?.kind).toBe('file');
    expect(sub?.kind).toBe('directory');
  });

  it('listDir returns empty array for nonexistent directory', async () => {
    const entries = await store.listDir('nowhere');
    expect(entries).toEqual([]);
  });

  it('remove deletes a file', async () => {
    await store.writeText('del.md', 'x');
    expect(await store.exists('del.md')).toBe(true);
    await store.remove('del.md');
    expect(await store.exists('del.md')).toBe(false);
  });

  it('readText throws on missing file', async () => {
    await expect(store.readText('missing.md')).rejects.toThrow();
  });

  it('writeBinary + readBinary round-trip', async () => {
    const data = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    await store.writeBinary('test.pdf', data);
    const back = await store.readBinary('test.pdf');
    expect(Array.from(back)).toEqual([0x25, 0x50, 0x44, 0x46]);
  });
});
