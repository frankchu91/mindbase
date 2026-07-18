import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EmbeddingStore } from './embedding-store';

let tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'emb-store-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs) {
    rmSync(d, { recursive: true, force: true });
  }
  tmpDirs = [];
});

const FAKE_VECTOR = Array.from({ length: 1024 }, (_, i) => i / 1024);

describe('EmbeddingStore', () => {
  it('returns null for unknown slug', async () => {
    const store = new EmbeddingStore(makeTmpDir());
    expect(await store.get('missing-slug')).toBeNull();
  });

  it('round-trips an embedding', async () => {
    const store = new EmbeddingStore(makeTmpDir());
    await store.set('my-page', 'title body content', FAKE_VECTOR);
    const cached = await store.get('my-page');
    expect(cached).not.toBeNull();
    expect(cached!.slug).toBe('my-page');
    expect(cached!.vector).toHaveLength(1024);
    expect(cached!.vector[0]).toBeCloseTo(0);
    expect(cached!.model).toBe('Xenova/bge-m3');
  });

  it('hashMatches returns true for same content', async () => {
    const store = new EmbeddingStore(makeTmpDir());
    const content = 'title: Foo\nbody: Bar baz';
    await store.set('foo', content, FAKE_VECTOR);
    expect(await store.hashMatches('foo', content)).toBe(true);
  });

  it('hashMatches returns false for changed content', async () => {
    const store = new EmbeddingStore(makeTmpDir());
    await store.set('foo', 'original content', FAKE_VECTOR);
    expect(await store.hashMatches('foo', 'changed content')).toBe(false);
  });

  it('hashMatches returns false when no cache entry', async () => {
    const store = new EmbeddingStore(makeTmpDir());
    expect(await store.hashMatches('nonexistent', 'some content')).toBe(false);
  });

  it('list returns all stored embeddings', async () => {
    const store = new EmbeddingStore(makeTmpDir());
    await store.set('page-a', 'content a', FAKE_VECTOR);
    await store.set('page-b', 'content b', FAKE_VECTOR);
    const all = await store.list();
    expect(all).toHaveLength(2);
    const slugs = all.map((e) => e.slug).sort();
    expect(slugs).toEqual(['page-a', 'page-b']);
  });

  it('list returns empty array when nothing stored', async () => {
    const store = new EmbeddingStore(makeTmpDir());
    expect(await store.list()).toEqual([]);
  });

  it('delete removes the embedding', async () => {
    const store = new EmbeddingStore(makeTmpDir());
    await store.set('to-delete', 'content', FAKE_VECTOR);
    await store.delete('to-delete');
    expect(await store.get('to-delete')).toBeNull();
  });

  it('delete is a no-op for non-existent slug', async () => {
    const store = new EmbeddingStore(makeTmpDir());
    // Should not throw
    await expect(store.delete('ghost')).resolves.toBeUndefined();
  });

  it('overwrites an existing embedding on set', async () => {
    const store = new EmbeddingStore(makeTmpDir());
    const v1 = Array.from({ length: 1024 }, () => 0.1);
    const v2 = Array.from({ length: 1024 }, () => 0.9);
    await store.set('page', 'content v1', v1);
    await store.set('page', 'content v2', v2);
    const cached = await store.get('page');
    expect(cached!.vector[0]).toBeCloseTo(0.9);
    expect(await store.hashMatches('page', 'content v2')).toBe(true);
    expect(await store.hashMatches('page', 'content v1')).toBe(false);
  });

  it('contentHash is deterministic', () => {
    const h1 = EmbeddingStore.contentHash('hello world');
    const h2 = EmbeddingStore.contentHash('hello world');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA256 hex
  });
});
