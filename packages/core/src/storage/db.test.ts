import { describe, it, expect, beforeEach } from 'vitest';
import { AtlasDB } from './db';

describe('AtlasDB', () => {
  let db: AtlasDB;

  beforeEach(async () => {
    db = new AtlasDB(`test-${Math.random()}`);
    await db.open();
  });

  it('stores and retrieves an API key', async () => {
    await db.setKey('openai', 'sk-test');
    const k = await db.getKey('openai');
    expect(k).toBe('sk-test');
  });

  it('returns undefined for missing key', async () => {
    expect(await db.getKey('anthropic')).toBeUndefined();
  });

  it('updates an existing key', async () => {
    await db.setKey('openai', 'sk-old');
    await db.setKey('openai', 'sk-new');
    expect(await db.getKey('openai')).toBe('sk-new');
  });

  it('enqueues and dequeues compile tasks in FIFO order', async () => {
    await db.enqueueCompile({ raw_id: 'a', enqueued_at: '2026-04-08T00:00:00Z' });
    await db.enqueueCompile({ raw_id: 'b', enqueued_at: '2026-04-08T00:00:01Z' });
    const next1 = await db.dequeueCompile();
    const next2 = await db.dequeueCompile();
    const next3 = await db.dequeueCompile();
    expect(next1?.raw_id).toBe('a');
    expect(next2?.raw_id).toBe('b');
    expect(next3).toBeUndefined();
  });

  it('saves and loads a chat session', async () => {
    await db.saveChatSession('s1', [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    const msgs = await db.loadChatSession('s1');
    expect(msgs).toHaveLength(2);
    expect(msgs?.[0]?.role).toBe('user');
  });

  it('stores and retrieves the serialized search index', async () => {
    await db.saveSearchIndex('{"foo":"bar"}');
    expect(await db.loadSearchIndex()).toBe('{"foo":"bar"}');
  });
});
