import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { WikiIndex } from '../graph/index/wiki-index';
import { reindex } from '../graph/index/reindex';
import { findContradictionCandidates, judgeContradictionPair, runContradictionProbe, type Verdict } from './contradiction-probe';
import type { LLMAdapter } from '../adapters/types';

async function seed(store: MemoryStore, slug: string, body: string, type = 'concept'): Promise<void> {
  await store.writeText(`wiki/notes/${slug}.md`, body);
  await store.writeJSON(`wiki/notes/${slug}.meta.json`, { title: slug, type });
}

describe('findContradictionCandidates', () => {
  it('returns pages with "vs [[X]]" cue', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A\n\nMy approach vs [[b]] gives better recall.');
    await seed(store, 'b', '# B');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    const candidates = await findContradictionCandidates(store, index, { maxCandidates: 10 });
    expect(candidates).toContainEqual(expect.objectContaining({ slugA: 'a', slugB: 'b' }));
    index.close();
  });

  it('returns pages with "unlike [[X]]" cue', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A\n\nUnlike [[b]], we use…');
    await seed(store, 'b', '# B');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    const candidates = await findContradictionCandidates(store, index, { maxCandidates: 10 });
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    index.close();
  });

  it('returns pages with "contradicts [[X]]" cue', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A\n\nThis contradicts [[b]].');
    await seed(store, 'b', '# B');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    const candidates = await findContradictionCandidates(store, index, { maxCandidates: 10 });
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    index.close();
  });

  it('skips when the target slug does not exist as a page', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A\n\nUnlike [[ghost]], we use…');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    const candidates = await findContradictionCandidates(store, index, { maxCandidates: 10 });
    expect(candidates).toEqual([]);
    index.close();
  });

  it('dedupes the same (a, b) pair across multiple cues', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A\n\nvs [[b]] and also unlike [[b]] and contradicts [[b]]');
    await seed(store, 'b', '# B');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    const candidates = await findContradictionCandidates(store, index, { maxCandidates: 10 });
    const matchingPairs = candidates.filter((c) => c.slugA === 'a' && c.slugB === 'b');
    expect(matchingPairs.length).toBe(1);
    index.close();
  });

  it('respects maxCandidates limit', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 20; i++) {
      await seed(store, `a${i}`, `# A${i}\n\nvs [[target]]`);
    }
    await seed(store, 'target', '# Target');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    const candidates = await findContradictionCandidates(store, index, { maxCandidates: 5 });
    expect(candidates).toHaveLength(5);
    index.close();
  });
});

function fakeAdapter(verdict: Verdict, reason: string): LLMAdapter {
  return {
    async *chat() {
      const payload = JSON.stringify({ verdict, reason });
      yield { kind: 'delta' as const, text: payload };
      yield { kind: 'done' as const, usage: { input_tokens: 100, output_tokens: 20 } };
    },
    embed: async () => [],
    supportsPDFs: false,
  } as unknown as LLMAdapter;
}

describe('judgeContradictionPair', () => {
  it('returns verdict + reason from LLM JSON response', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A\n\nA strict statement.');
    await seed(store, 'b', '# B\n\nA conflicting statement.');
    const adapter = fakeAdapter('contradicts', 'A says X, B says not-X');
    const result = await judgeContradictionPair(adapter, 'gpt-4o', store, 'a', 'b');
    expect(result.verdict).toBe('contradicts');
    expect(result.reason).toContain('X');
  });

  it('returns compatible verdict', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A');
    await seed(store, 'b', '# B');
    const adapter = fakeAdapter('compatible', 'no real conflict');
    const result = await judgeContradictionPair(adapter, 'gpt-4o', store, 'a', 'b');
    expect(result.verdict).toBe('compatible');
  });

  it('handles missing body gracefully (returns unrelated verdict)', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A');
    // b is never written
    const adapter = fakeAdapter('contradicts', 'irrelevant');
    const result = await judgeContradictionPair(adapter, 'gpt-4o', store, 'a', 'b');
    expect(result.verdict).toBe('unrelated');
  });

  it('handles malformed LLM JSON by returning unrelated', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A');
    await seed(store, 'b', '# B');
    const badAdapter = {
      async *chat() {
        yield { kind: 'delta' as const, text: 'not json' };
        yield { kind: 'done' as const, usage: { input_tokens: 0, output_tokens: 0 } };
      },
      embed: async () => [],
      supportsPDFs: false,
    } as unknown as LLMAdapter;
    const result = await judgeContradictionPair(badAdapter, 'gpt-4o', store, 'a', 'b');
    expect(result.verdict).toBe('unrelated');
  });
});

describe('runContradictionProbe', () => {
  it('judges new candidates and persists verdicts', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A\n\nvs [[b]]');
    await seed(store, 'b', '# B');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    const adapter = fakeAdapter('contradicts', 'real conflict');
    const result = await runContradictionProbe({
      store, wikiIndex: index, adapter, model: 'gpt-4o',
      maxCandidates: 10,
    });
    expect(result.judged).toBe(1);
    expect(result.cached).toBe(0);
    const verdicts = index.contradictionCache().listConfirmed();
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.slugA).toBe('a');
    expect(verdicts[0]?.slugB).toBe('b');
    index.close();
  });

  it('skips LLM call when verdict is already cached for same (pair, model, prompt_version)', async () => {
    const store = new MemoryStore();
    await seed(store, 'a', '# A\n\nvs [[b]]');
    await seed(store, 'b', '# B');
    const index = WikiIndex.openInMemory();
    await reindex(store, index);

    index.contradictionCache().put({
      slugA: 'a', slugB: 'b',
      modelId: 'gpt-4o', promptVersion: 'judge/v1',
      verdict: 'compatible', reason: 'prior judgment',
    });

    const adapter = fakeAdapter('contradicts', 'should not be called');
    const result = await runContradictionProbe({
      store, wikiIndex: index, adapter, model: 'gpt-4o',
      maxCandidates: 10,
    });
    expect(result.judged).toBe(0);
    expect(result.cached).toBe(1);
    expect(index.contradictionCache().get('a', 'b', 'gpt-4o', 'judge/v1')?.verdict).toBe('compatible');
    index.close();
  });
});
