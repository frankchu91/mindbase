import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SynthesisCache } from './synthesis-cache';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mb-syncache-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('SynthesisCache', () => {
  it('write + read synthesis round-trips', async () => {
    const c = new SynthesisCache(dir);
    const data = {
      topic: 'rag', generated_at: 'now', model: 'm', source_hashes: { a: 'sha256:1' },
      summary: 's', threads: [], contradictions: [], gaps: [],
    };
    await c.writeSynthesis('rag', data);
    const got = await c.readSynthesis('rag');
    expect(got).toEqual(data);
  });

  it('read non-existent returns null', async () => {
    const c = new SynthesisCache(dir);
    expect(await c.readSynthesis('missing')).toBeNull();
  });

  it('markStaleFor adds keys to .stale file', async () => {
    const c = new SynthesisCache(dir);
    await c.writeSynthesis('rag', {
      topic: 'rag', generated_at: 'now', model: 'm',
      source_hashes: { 'note-a': 'sha256:1' },
      summary: '', threads: [], contradictions: [], gaps: [],
    });
    await c.markStaleFor('note-a');
    expect(await c.listStale()).toContain('rag');
  });

  it('clearStale removes the key', async () => {
    const c = new SynthesisCache(dir);
    await c.writeSynthesis('topic', { topic: 'topic', generated_at: 'now', model: 'm', source_hashes: { x: 's' }, summary: '', threads: [], contradictions: [], gaps: [] });
    await c.markStaleFor('x');
    await c.clearStale('topic');
    expect(await c.listStale()).not.toContain('topic');
  });

  it('writeNetwork + readNetwork', async () => {
    const c = new SynthesisCache(dir);
    const nv = { slug: 'foo', generated_at: 'now', semantic_related: [], missing_links: [], contradictions: [], mentioned_in: [] };
    await c.writeNetwork('foo', nv);
    expect(await c.readNetwork('foo')).toEqual(nv);
  });

  it('writePulse + readPulse', async () => {
    const c = new SynthesisCache(dir);
    const p = { generated_at: 'now', date: '2026-05-20', greeting: 'Morning.', weekly_writes: [], new_connections: [], stale_notes: [], contradictions: [], gaps: [], srs_due_count: 0 };
    await c.writePulse('2026-05-20', p);
    expect(await c.readPulse('2026-05-20')).toEqual(p);
  });

  it('topicKeysFor returns synth keys citing a slug', async () => {
    const c = new SynthesisCache(dir);
    await c.writeSynthesis('rag', { topic: 'rag', generated_at: 'now', model: 'm', source_hashes: { 'note-a': 's' }, summary: '', threads: [], contradictions: [], gaps: [] });
    await c.writeSynthesis('search', { topic: 'search', generated_at: 'now', model: 'm', source_hashes: { 'note-a': 's', 'note-b': 's' }, summary: '', threads: [], contradictions: [], gaps: [] });
    expect((await c.topicKeysFor('note-a')).sort()).toEqual(['rag', 'search']);
    expect(await c.topicKeysFor('note-b')).toEqual(['search']);
  });
});
