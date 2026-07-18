import { describe, it, expect } from 'vitest';
import { MemoryStore } from './memory_store';
import { ProjectScopedStore } from './project-scoped-store';

describe('ProjectScopedStore', () => {
  it('prepends projects/<id>/ to scoped paths', async () => {
    const inner = new MemoryStore();
    const scoped = new ProjectScopedStore(inner, 'rag');
    await scoped.writeText('wiki/concepts/foo.md', 'body');
    expect(await inner.readText('projects/rag/wiki/concepts/foo.md')).toBe('body');
  });

  it('does NOT scope projects/, meta/, config.json, attachments/, trash/', async () => {
    const inner = new MemoryStore();
    const scoped = new ProjectScopedStore(inner, 'rag');
    await scoped.writeText('projects/other/wiki/concepts/foo.md', 'x');
    await scoped.writeText('config.json', '{}');
    await scoped.writeText('attachments/abc/img.png.ocr.txt', 'ocr');
    expect(await inner.exists('projects/other/wiki/concepts/foo.md')).toBe(true);
    expect(await inner.exists('config.json')).toBe(true);
    expect(await inner.exists('attachments/abc/img.png.ocr.txt')).toBe(true);
  });

  it('reads scoped paths transparently', async () => {
    const inner = new MemoryStore();
    await inner.writeText('projects/p1/wiki/notes/x.md', 'hello');
    const scoped = new ProjectScopedStore(inner, 'p1');
    expect(await scoped.readText('wiki/notes/x.md')).toBe('hello');
  });

  it('listDir scopes the prefix', async () => {
    const inner = new MemoryStore();
    const scoped = new ProjectScopedStore(inner, 'p');
    await scoped.writeText('wiki/concepts/a.md', '');
    await scoped.writeText('wiki/concepts/b.md', '');
    const entries = await scoped.listDir('wiki/concepts');
    expect(entries.map((e) => e.name).sort()).toEqual(['a.md', 'b.md']);
  });

  it('unscoped() returns the inner store', () => {
    const inner = new MemoryStore();
    const scoped = new ProjectScopedStore(inner, 'p');
    expect(scoped.unscoped()).toBe(inner);
  });
});
