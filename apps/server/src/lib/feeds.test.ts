import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FeedStore, parseOpml } from '@mindbase/core';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mb-feeds-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('FeedStore', () => {
  it('add → list returns feed with normalized fields', async () => {
    const store = new FeedStore(dir);
    const feed = await store.add({
      url: 'https://example.com/feed.xml',
      name: 'Example Blog',
      tags: ['ai'],
      project: 'research',
      interval_minutes: 30,
      site_url: 'https://example.com',
    });
    expect(feed.id).toBeTruthy();
    expect(feed.url).toBe('https://example.com/feed.xml');
    expect(feed.name).toBe('Example Blog');
    expect(feed.tags).toEqual(['ai']);
    expect(feed.project).toBe('research');
    expect(feed.enabled).toBe(true);
    expect(feed.seen_guids).toEqual([]);
    expect(feed.items_ingested_total).toBe(0);
    expect(feed.items_ingested_24h).toBe(0);
    expect(feed.error_count_24h).toBe(0);

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.url).toBe('https://example.com/feed.xml');
  });

  it('add duplicate URL throws', async () => {
    const store = new FeedStore(dir);
    await store.add({ url: 'https://example.com/feed.xml', name: 'A', tags: [], project: undefined, interval_minutes: undefined, site_url: undefined });
    await expect(
      store.add({ url: 'https://example.com/feed.xml', name: 'B', tags: [], project: undefined, interval_minutes: undefined, site_url: undefined }),
    ).rejects.toThrow('already');
  });

  it('update tags persists across instances', async () => {
    const a = new FeedStore(dir);
    const feed = await a.add({ url: 'https://example.com/f.xml', name: 'X', tags: [], project: undefined, interval_minutes: undefined, site_url: undefined });
    await a.update(feed.id, { tags: ['news', 'tech'] });

    const b = new FeedStore(dir);
    const list = await b.list();
    expect(list[0]!.tags).toEqual(['news', 'tech']);
  });

  it('remove → gone', async () => {
    const store = new FeedStore(dir);
    const feed = await store.add({ url: 'https://example.com/f.xml', name: 'X', tags: [], project: undefined, interval_minutes: undefined, site_url: undefined });
    await store.remove(feed.id);
    const list = await store.list();
    expect(list).toHaveLength(0);
  });

  it('markPolled updates seen_guids, capped at 200', async () => {
    const store = new FeedStore(dir);
    const feed = await store.add({ url: 'https://example.com/f.xml', name: 'X', tags: [], project: undefined, interval_minutes: undefined, site_url: undefined });

    // Add 250 guids in two rounds to test cap
    const firstBatch = Array.from({ length: 150 }, (_, i) => `guid-${i}`);
    await store.markPolled(feed.id, { newGuids: firstBatch, ingested: 10 });

    const secondBatch = Array.from({ length: 100 }, (_, i) => `guid-${150 + i}`);
    await store.markPolled(feed.id, { newGuids: secondBatch, ingested: 5 });

    const updated = await store.findById(feed.id);
    expect(updated!.seen_guids.length).toBe(200);
    // Last guid should be 'guid-249'
    expect(updated!.seen_guids[updated!.seen_guids.length - 1]).toBe('guid-249');
    // items_ingested_total should be 15
    expect(updated!.items_ingested_total).toBe(15);
  });

  it('markPolled 24h counter rollover', async () => {
    const store = new FeedStore(dir);
    const feed = await store.add({ url: 'https://example.com/f.xml', name: 'X', tags: [], project: undefined, interval_minutes: undefined, site_url: undefined });

    // First poll — increments normally
    await store.markPolled(feed.id, { newGuids: ['g1'], ingested: 3 });
    let updated = await store.findById(feed.id);
    expect(updated!.items_ingested_24h).toBe(3);

    // Manually backdate the window to >24h ago
    const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await store.update(feed.id, { items_ingested_24h_window: pastDate });

    // Second poll after window expired — counter should reset
    await store.markPolled(feed.id, { newGuids: ['g2'], ingested: 5 });
    updated = await store.findById(feed.id);
    expect(updated!.items_ingested_24h).toBe(5); // reset, not 8
    expect(updated!.items_ingested_total).toBe(8); // total still accumulates
  });

  it('markError increments counter, sets last_error', async () => {
    const store = new FeedStore(dir);
    const feed = await store.add({ url: 'https://example.com/f.xml', name: 'X', tags: [], project: undefined, interval_minutes: undefined, site_url: undefined });

    await store.markError(feed.id, 'HTTP 503 Service Unavailable');
    await store.markError(feed.id, 'Connection timeout');

    const updated = await store.findById(feed.id);
    expect(updated!.error_count_24h).toBe(2);
    expect(updated!.last_error).toBe('Connection timeout');
    expect(updated!.last_polled_at).toBeTruthy();
  });

  it('summaries omits seen_guids, etag, last_modified', async () => {
    const store = new FeedStore(dir);
    await store.add({ url: 'https://example.com/f.xml', name: 'X', tags: [], project: undefined, interval_minutes: undefined, site_url: undefined });
    await store.markPolled(
      (await store.list())[0]!.id,
      { etag: '"abc"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', newGuids: ['g1'], ingested: 1 },
    );
    const summaries = await store.summaries();
    expect((summaries[0] as Record<string, unknown>)['seen_guids']).toBeUndefined();
    expect((summaries[0] as Record<string, unknown>)['etag']).toBeUndefined();
    expect((summaries[0] as Record<string, unknown>)['last_modified']).toBeUndefined();
  });
});

describe('parseOpml', () => {
  it('parses flat OPML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My feeds</title></head>
  <body>
    <outline type="rss" text="Hacker News" title="Hacker News" xmlUrl="https://news.ycombinator.com/rss" htmlUrl="https://news.ycombinator.com"/>
    <outline type="rss" text="Example Blog" title="Example Blog" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com"/>
  </body>
</opml>`;
    const result = parseOpml(xml);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ title: 'Hacker News', xmlUrl: 'https://news.ycombinator.com/rss' });
    expect(result[1]).toEqual({ title: 'Example Blog', xmlUrl: 'https://example.com/feed.xml' });
  });

  it('flattens nested folder structure', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline title="Tech">
      <outline type="rss" title="Feed A" xmlUrl="https://a.com/feed.xml"/>
      <outline title="Subgroup">
        <outline type="rss" title="Feed B" xmlUrl="https://b.com/feed.xml"/>
      </outline>
    </outline>
    <outline type="rss" title="Feed C" xmlUrl="https://c.com/feed.xml"/>
  </body>
</opml>`;
    const result = parseOpml(xml);
    const urls = result.map(r => r.xmlUrl);
    expect(urls).toContain('https://a.com/feed.xml');
    expect(urls).toContain('https://b.com/feed.xml');
    expect(urls).toContain('https://c.com/feed.xml');
  });

  it('uses text attribute when no title present', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="Text Only Feed" xmlUrl="https://example.com/rss"/>
  </body>
</opml>`;
    const result = parseOpml(xml);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Text Only Feed');
  });

  it('handles malformed XML, returns empty array without throwing', () => {
    const result = parseOpml('<not valid xml <<>>');
    // Should not throw; may return empty or partial
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns empty array for empty OPML body', () => {
    const xml = `<?xml version="1.0"?><opml version="2.0"><body></body></opml>`;
    expect(parseOpml(xml)).toEqual([]);
  });
});
