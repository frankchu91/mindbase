import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { ensureSchema, loadSchema, SCHEMA_PATH, DEFAULT_SCHEMA } from './schema';

describe('ensureSchema', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('creates schema.md when missing and returns true', async () => {
    const created = await ensureSchema(store);
    expect(created).toBe(true);
    expect(await store.exists(SCHEMA_PATH)).toBe(true);
    const body = await store.readText(SCHEMA_PATH);
    expect(body).toBe(DEFAULT_SCHEMA);
  });

  it('does not overwrite when already present and returns false', async () => {
    const customContent = '# Custom schema by user';
    await store.writeText(SCHEMA_PATH, customContent);
    const created = await ensureSchema(store);
    expect(created).toBe(false);
    const body = await store.readText(SCHEMA_PATH);
    expect(body).toBe(customContent);
  });
});

describe('loadSchema', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('returns user-edited content when file exists', async () => {
    const customContent = '# My custom rules';
    await store.writeText(SCHEMA_PATH, customContent);
    const result = await loadSchema(store);
    expect(result).toBe(customContent);
  });

  it('returns the default schema when file is missing', async () => {
    const result = await loadSchema(store);
    expect(result).toBe(DEFAULT_SCHEMA);
  });
});
