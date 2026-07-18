import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import {
  loadClassifyRules, saveClassifyRules, ensureDefaultRules,
  RULES_PATH, RULES_MAX_CHARS, RulesTooLongError,
} from './rules';

describe('classify rules storage', () => {
  it('loadClassifyRules returns empty string when missing', async () => {
    const store = new MemoryStore();
    const r = await loadClassifyRules(store);
    expect(r).toBe('');
  });

  it('ensureDefaultRules writes a starter rules.md when missing', async () => {
    const store = new MemoryStore();
    await ensureDefaultRules(store);
    const r = await loadClassifyRules(store);
    expect(r.length).toBeGreaterThan(0);
    expect(r).toContain('inbox');
  });

  it('ensureDefaultRules is idempotent — does not overwrite existing rules', async () => {
    const store = new MemoryStore();
    await saveClassifyRules(store, '# My custom rules\n\n1. Test rule');
    await ensureDefaultRules(store);
    const r = await loadClassifyRules(store);
    expect(r).toContain('My custom rules');
    expect(r).not.toContain('inbox'); // default wasn't applied on top
  });

  it('saveClassifyRules under cap succeeds', async () => {
    const store = new MemoryStore();
    await saveClassifyRules(store, 'a'.repeat(RULES_MAX_CHARS));
    const r = await loadClassifyRules(store);
    expect(r.length).toBe(RULES_MAX_CHARS);
  });

  it('saveClassifyRules throws RulesTooLongError when over cap', async () => {
    const store = new MemoryStore();
    await expect(saveClassifyRules(store, 'a'.repeat(RULES_MAX_CHARS + 1)))
      .rejects.toThrow(RulesTooLongError);
  });
});
