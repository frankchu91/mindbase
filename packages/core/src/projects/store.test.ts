import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { listProjects, getProject, createProject, deleteProject } from './store';

describe('createProject', () => {
  it('writes meta.json with slugified id from name', async () => {
    const store = new MemoryStore();
    const meta = await createProject(store, { name: 'My RAG Research' });
    expect(meta.id).toBe('my-rag-research');
    expect(meta.name).toBe('My RAG Research');
    expect(meta.schemaVersion).toBe(1);
    expect(await store.exists('projects/my-rag-research/meta.json')).toBe(true);
  });

  it('uses idHint when valid', async () => {
    const store = new MemoryStore();
    const meta = await createProject(store, { name: 'X', idHint: 'custom-id' });
    expect(meta.id).toBe('custom-id');
  });

  it('disambiguates colliding ids with -2, -3, ...', async () => {
    const store = new MemoryStore();
    await createProject(store, { name: 'Foo' });
    const m2 = await createProject(store, { name: 'Foo' });
    expect(m2.id).toBe('foo-2');
  });

  it('scaffolds the v2 layout — README.md marker, context, index, source dirs', async () => {
    const store = new MemoryStore();
    const m = await createProject(store, { name: 'P' });
    // README.md is the v2 layout marker: without it detectLayoutVersion
    // reports v1 and every v2 route 409s on the fresh project.
    expect(await store.exists(`projects/${m.id}/README.md`)).toBe(true);
    expect(await store.exists(`projects/${m.id}/context.md`)).toBe(true);
    expect(await store.exists(`projects/${m.id}/index.yaml`)).toBe(true);
    expect(await store.exists(`projects/${m.id}/sources/contributors/.gitkeep`)).toBe(true);
    expect(await store.exists(`projects/${m.id}/sources/research/.gitkeep`)).toBe(true);
    expect(await store.exists(`projects/${m.id}/sources/raw/.gitkeep`)).toBe(true);
    // No v1 leftovers
    expect(await store.exists(`projects/${m.id}/wiki/concepts/.gitkeep`)).toBe(false);
    expect(await store.exists(`projects/${m.id}/raw/.gitkeep`)).toBe(false);
    const readme = await store.readText(`projects/${m.id}/README.md`);
    expect(readme).toContain('# P — Operations Manual');
  });

  it('respects template option', async () => {
    const store = new MemoryStore();
    const meta = await createProject(store, {
      name: 'Lit Review',
      template: 'literature-review',
    });
    expect(meta.template).toBe('literature-review');
  });

  it('writes schema.md for valid template', async () => {
    const store = new MemoryStore();
    const meta = await createProject(store, {
      name: 'Market Research',
      template: 'market-research',
    });
    const schemaPath = `projects/${meta.id}/schema/schema.md`;
    expect(await store.exists(schemaPath)).toBe(true);
    const content = await store.readText(schemaPath);
    expect(content).toContain('# Wiki Schema — Market Research');
    expect(content).toContain('Track companies, products, and the competitive landscape');
  });

  it('sets created timestamp', async () => {
    const store = new MemoryStore();
    const before = new Date();
    const meta = await createProject(store, { name: 'X' });
    const after = new Date();
    const created = new Date(meta.created);
    expect(created.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(created.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('listProjects', () => {
  it('returns [] for empty store', async () => {
    const store = new MemoryStore();
    expect(await listProjects(store)).toEqual([]);
  });

  it('returns all projects sorted by name', async () => {
    const store = new MemoryStore();
    await createProject(store, { name: 'Zebra' });
    await createProject(store, { name: 'Alpha' });
    const list = await listProjects(store);
    expect(list.map((p) => p.name)).toEqual(['Alpha', 'Zebra']);
  });

  it('skips malformed project dirs', async () => {
    const store = new MemoryStore();
    await createProject(store, { name: 'Good' });
    // Write an invalid meta.json
    await store.writeText('projects/bad/meta.json', 'not valid json {');
    const list = await listProjects(store);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Good');
  });
});

describe('getProject', () => {
  it('returns null for missing id', async () => {
    const store = new MemoryStore();
    expect(await getProject(store, 'nope')).toBeNull();
  });

  it('returns the meta for an existing project', async () => {
    const store = new MemoryStore();
    const created = await createProject(store, { name: 'X' });
    const fetched = await getProject(store, created.id);
    expect(fetched).toEqual(created);
  });

  it('returns null on malformed meta.json', async () => {
    const store = new MemoryStore();
    await store.writeText('projects/broken/meta.json', '{invalid}');
    expect(await getProject(store, 'broken')).toBeNull();
  });
});

describe('deleteProject', () => {
  it('removes meta.json (soft delete)', async () => {
    const store = new MemoryStore();
    const m = await createProject(store, { name: 'X' });
    await deleteProject(store, m.id);
    expect(await getProject(store, m.id)).toBeNull();
    // Data dir untouched
    expect(await store.exists(`projects/${m.id}/README.md`)).toBe(true);
  });

  it('throws on invalid project id', async () => {
    const store = new MemoryStore();
    await expect(deleteProject(store, 'UPPERCASE')).rejects.toThrow('invalid project id');
  });
});
