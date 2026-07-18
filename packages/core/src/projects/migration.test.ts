import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { migrateLegacyData } from './migration';

describe('migrateLegacyData', () => {
  it('is a no-op when projects/default already exists', async () => {
    const store = new MemoryStore();
    await store.writeJSON('projects/default/meta.json', { id: 'default' });
    const r = await migrateLegacyData(store);
    expect(r.ran).toBe(false);
  });

  it('scaffolds a default project when no legacy data exists', async () => {
    const store = new MemoryStore();
    const r = await migrateLegacyData(store);
    expect(r.ran).toBe(true);
    expect(r.movedFiles).toBe(0);
    expect(await store.exists('projects/default/meta.json')).toBe(true);
    expect(await store.exists('projects/default/wiki/concepts/.gitkeep')).toBe(true);
  });

  it('moves legacy wiki/ files into projects/default/wiki/', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/concepts/foo.md', '# Foo');
    await store.writeText('wiki/notes/bar.md', '# Bar');
    const r = await migrateLegacyData(store);
    expect(r.ran).toBe(true);
    expect(r.movedFiles).toBeGreaterThanOrEqual(2);
    expect(await store.exists('projects/default/wiki/concepts/foo.md')).toBe(true);
    expect(await store.exists('projects/default/wiki/notes/bar.md')).toBe(true);
    expect(await store.exists('wiki/concepts/foo.md')).toBe(false);
    expect(await store.exists('wiki/notes/bar.md')).toBe(false);
  });

  it('moves legacy raw/ files including binary PDFs', async () => {
    const store = new MemoryStore();
    await store.writeText('raw/2026-05-23/abc.md', 'extracted text');
    await store.writeJSON('raw/2026-05-23/abc.meta.json', { id: 'abc' });
    await store.writeBinary('raw/2026-05-23/abc.original.pdf', new Uint8Array([1, 2, 3]));
    const r = await migrateLegacyData(store);
    expect(r.ran).toBe(true);
    expect(await store.exists('projects/default/raw/2026-05-23/abc.original.pdf')).toBe(true);
    expect((await store.readBinary('projects/default/raw/2026-05-23/abc.original.pdf'))[0]).toBe(1);
  });

  it('writes meta.json after migration', async () => {
    const store = new MemoryStore();
    await store.writeText('wiki/concepts/foo.md', 'x');
    await migrateLegacyData(store);
    const meta = await store.readJSON<{ id: string; name: string }>('projects/default/meta.json');
    expect(meta.id).toBe('default');
    expect(meta.name).toBe('Default project');
  });
});
