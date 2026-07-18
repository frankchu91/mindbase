import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inbox } from './inbox';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mb-inbox-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('Inbox', () => {
  it('writes a queued entry and returns id', async () => {
    const ibx = new Inbox(dir);
    const { id, status } = await ibx.add({
      type: 'url', url: 'https://example.com', title: 'X',
      captured_at: new Date().toISOString(), captured_via: 'browser-ext',
      captured_device_id: 'dev1',
    });
    expect(id).toMatch(/^[0-9A-Z]{26}$/);
    expect(status).toBe('queued');
  });

  it('detects dedup by client_dedup_key within 5min', async () => {
    const ibx = new Inbox(dir);
    const base = { type: 'url' as const, url: 'https://example.com', captured_at: new Date().toISOString(), captured_via: 'browser-ext' as const, captured_device_id: 'd' };
    const { id: a } = await ibx.add({ ...base, client_dedup_key: 'abc' });
    await expect(ibx.add({ ...base, client_dedup_key: 'abc' })).rejects.toThrow(/duplicate/i);
    expect(a).toBeTruthy();
  });

  it('lists queued entries', async () => {
    const ibx = new Inbox(dir);
    await ibx.add({ type: 'text', text: 'hi', captured_at: new Date().toISOString(), captured_via: 'browser-ext', captured_device_id: 'd' });
    const list = await ibx.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe('queued');
  });

  it('moves to processed on markCompiled', async () => {
    const ibx = new Inbox(dir);
    const { id } = await ibx.add({ type: 'text', text: 'hi', captured_at: new Date().toISOString(), captured_via: 'browser-ext', captured_device_id: 'd' });
    await ibx.markCompiled(id, 'some-slug');
    const list = await ibx.list();
    const entry = list.find(e => e.id === id)!;
    expect(entry.status).toBe('compiled');
    expect(entry.wiki_slug).toBe('some-slug');
  });

  it('moves to failed on markFailed', async () => {
    const ibx = new Inbox(dir);
    const { id } = await ibx.add({ type: 'text', text: 'hi', captured_at: new Date().toISOString(), captured_via: 'browser-ext', captured_device_id: 'd' });
    await ibx.markFailed(id, 'compile error');
    const list = await ibx.list();
    expect(list.find(e => e.id === id)!.status).toBe('failed');
  });
});
