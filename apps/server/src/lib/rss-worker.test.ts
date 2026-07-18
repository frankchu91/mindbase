import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FeedStore } from '@mindbase/core';
import type { Feed } from '@mindbase/core';
import { RSSWorker } from './rss-worker';
import type { Inbox } from './inbox';
import type { ServerContext } from '../context';

// Minimal mocks for ctx and inbox
function makeCtx(rss?: Partial<ServerContext['config']['rss']>): ServerContext {
  return {
    config: {
      rss: {
        enabled: true,
        intervalMinutes: 60,
        fetchTimeoutMs: 5000,
        fetchUserAgent: 'MindBase-Test/0.1',
        readabilityEnabled: false,     // default to false in tests to avoid real HTTP
        ...rss,
      },
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: '',
      baseUrl: '',
      autoSave: false,
      mergeSaves: false,
      maxContextChars: 50000,
    },
  } as unknown as ServerContext;
}

function makeInbox(): Inbox & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    add: vi.fn(async (input: unknown) => {
      calls.push([input]);
      return { id: 'test-id', status: 'queued' as const };
    }),
  } as unknown as Inbox & { calls: unknown[][] };
}

// Minimal valid RSS XML
const RSS_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Old Post</title>
      <link>https://example.com/old</link>
      <guid>guid-old</guid>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <description>Old content long enough to meet minimum size requirements for fallback</description>
    </item>
    <item>
      <title>New Post A</title>
      <link>https://example.com/new-a</link>
      <guid>guid-new-a</guid>
      <pubDate>Sat, 01 Jan 2028 00:00:00 GMT</pubDate>
      <description>New content for post A long enough to meet minimum 10 char requirement</description>
    </item>
    <item>
      <title>New Post B</title>
      <link>https://example.com/new-b</link>
      <guid>guid-new-b</guid>
      <pubDate>Sun, 02 Jan 2028 00:00:00 GMT</pubDate>
      <description>New content for post B long enough to meet minimum 10 char requirement</description>
    </item>
  </channel>
</rss>`;

let dir: string;
let fetchMock: MockedFunction<typeof fetch>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mb-rss-worker-'));
  fetchMock = vi.spyOn(globalThis, 'fetch') as MockedFunction<typeof fetch>;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function mockFetchResponse(body: string, status = 200, headers: Record<string, string> = {}) {
  fetchMock.mockResolvedValue(
    new Response(body, {
      status,
      headers: {
        'content-type': 'application/rss+xml',
        ...headers,
      },
    }),
  );
}

async function addFeed(store: FeedStore, overrides: Partial<Feed> = {}): Promise<Feed> {
  const feed = await store.add({
    url: 'https://example.com/feed.xml',
    name: 'Test Feed',
    tags: ['test'],
    project: undefined,
    interval_minutes: undefined,
    site_url: 'https://example.com',
  });
  if (Object.keys(overrides).length > 0) {
    await store.update(feed.id, overrides);
    return (await store.findById(feed.id))!;
  }
  return feed;
}

describe('RSSWorker.tick()', () => {
  it('fresh feed: old items only recorded as seen, new items ingested', async () => {
    const store = new FeedStore(dir);
    await addFeed(store); // added_at is now; old post pubDate is 2024
    mockFetchResponse(RSS_BODY);

    const ctx = makeCtx({ readabilityEnabled: false });
    const inbox = makeInbox();
    const worker = new RSSWorker(ctx, store, inbox);

    const result = await worker.tick();
    expect(result.feeds_polled).toBe(1);
    // Only "new" items (pubDate 2028) should be ingested
    expect(result.total_ingested).toBe(2);
    expect(result.errors).toHaveLength(0);

    const feed = await store.findById((await store.list())[0]!.id);
    // All 3 guids should be in seen_guids (old one tracked but not ingested)
    expect(feed!.seen_guids).toContain('guid-old');
    expect(feed!.seen_guids).toContain('guid-new-a');
    expect(feed!.seen_guids).toContain('guid-new-b');
  });

  it('subsequent poll: only new guids since last poll are ingested', async () => {
    const store = new FeedStore(dir);
    const feed = await addFeed(store);
    // Pre-populate seen_guids with the two new guids (simulating prior poll)
    await store.update(feed.id, { seen_guids: ['guid-old', 'guid-new-a', 'guid-new-b'] });

    const newRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Brand New Post</title>
      <link>https://example.com/brand-new</link>
      <guid>guid-brand-new</guid>
      <pubDate>Mon, 03 Jan 2028 00:00:00 GMT</pubDate>
      <description>Brand new content that is long enough for the fallback to accept it</description>
    </item>
    <item>
      <title>New Post A</title>
      <link>https://example.com/new-a</link>
      <guid>guid-new-a</guid>
      <pubDate>Sat, 01 Jan 2028 00:00:00 GMT</pubDate>
      <description>Already seen content</description>
    </item>
  </channel>
</rss>`;
    mockFetchResponse(newRss);

    const ctx = makeCtx({ readabilityEnabled: false });
    const inbox = makeInbox();
    const worker = new RSSWorker(ctx, store, inbox);

    const result = await worker.tick();
    expect(result.total_ingested).toBe(1); // only brand-new
    expect(inbox.calls).toHaveLength(1);
    const addedItem = inbox.calls[0]![0] as { title: string };
    expect(addedItem.title).toBe('Brand New Post');
  });

  it('304 Not Modified: markPolled with empty guids, no ingest', async () => {
    const store = new FeedStore(dir);
    const feed = await addFeed(store, { etag: '"abc123"' });
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }));

    const ctx = makeCtx({ readabilityEnabled: false });
    const inbox = makeInbox();
    const worker = new RSSWorker(ctx, store, inbox);

    const result = await worker.tick();
    expect(result.total_ingested).toBe(0);
    expect(inbox.calls).toHaveLength(0);
    expect(result.errors).toHaveLength(0);

    const updated = await store.findById(feed.id);
    expect(updated!.last_polled_at).toBeTruthy();
    expect(updated!.last_success_at).toBeTruthy();
  });

  it('4xx response: markError called, no crash', async () => {
    const store = new FeedStore(dir);
    const feed = await addFeed(store);
    mockFetchResponse('Not Found', 404);

    const ctx = makeCtx({ readabilityEnabled: false });
    const inbox = makeInbox();
    const worker = new RSSWorker(ctx, store, inbox);

    const result = await worker.tick();
    expect(result.total_ingested).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toMatch(/404/);

    const updated = await store.findById(feed.id);
    expect(updated!.last_error).toMatch(/404/);
    expect(updated!.error_count_24h).toBe(1);
  });

  it('conditional headers: when feed has etag, request includes If-None-Match', async () => {
    const store = new FeedStore(dir);
    await addFeed(store, { etag: '"my-etag-value"', seen_guids: ['existing'] });
    mockFetchResponse(RSS_BODY);

    const ctx = makeCtx({ readabilityEnabled: false });
    const inbox = makeInbox();
    const worker = new RSSWorker(ctx, store, inbox);

    await worker.tick();

    const call = fetchMock.mock.calls[0];
    const requestHeaders = call?.[1]?.headers as Record<string, string> | undefined;
    expect(requestHeaders?.['If-None-Match']).toBe('"my-etag-value"');
  });

  it('network timeout: error recorded, worker does not crash', async () => {
    const store = new FeedStore(dir);
    const feed = await addFeed(store);
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

    const ctx = makeCtx({ readabilityEnabled: false, fetchTimeoutMs: 100 });
    const inbox = makeInbox();
    const worker = new RSSWorker(ctx, store, inbox);

    const result = await worker.tick();
    expect(result.errors).toHaveLength(1);

    const updated = await store.findById(feed.id);
    expect(updated!.last_error).toBeTruthy();
  });
});

describe('RSSWorker.extractText (via pollOne)', () => {
  it('readabilityEnabled=false: uses RSS snippet directly', async () => {
    const store = new FeedStore(dir);
    await addFeed(store, { seen_guids: [] });
    mockFetchResponse(RSS_BODY);

    const ctx = makeCtx({ readabilityEnabled: false });
    const inbox = makeInbox();
    const worker = new RSSWorker(ctx, store, inbox);

    await worker.tick();

    // Check inbox was called with text derived from RSS description (no fetch to article URL)
    expect(inbox.calls.length).toBeGreaterThan(0);
    const call = inbox.calls[0]![0] as { text: string };
    expect(call.text).toContain('New Post A');
  });

  it('readabilityEnabled=true but article fetch fails: falls back to RSS snippet', async () => {
    const store = new FeedStore(dir);
    // seen_guids has old so only 2 new items are attempted
    await addFeed(store, { seen_guids: ['guid-old'] });

    // First call = feed fetch (success), subsequent calls = article fetch (fail)
    fetchMock
      .mockResolvedValueOnce(new Response(RSS_BODY, { status: 200 }))
      .mockRejectedValue(new Error('ECONNREFUSED'));

    const ctx = makeCtx({ readabilityEnabled: true });
    const inbox = makeInbox();
    const worker = new RSSWorker(ctx, store, inbox);

    const result = await worker.tick();
    // Both new items should still be ingested via fallback
    expect(result.total_ingested).toBe(2);
    expect(result.errors).toHaveLength(0);
  });
});

describe('RSSWorker.pollOne()', () => {
  it('throws when feed not found', async () => {
    const store = new FeedStore(dir);
    const ctx = makeCtx();
    const inbox = makeInbox();
    const worker = new RSSWorker(ctx, store, inbox);
    await expect(worker.pollOne('nonexistent-id')).rejects.toThrow('Feed not found');
  });

  it('polls single feed regardless of enabled flag', async () => {
    const store = new FeedStore(dir);
    const feed = await addFeed(store, { enabled: false, seen_guids: ['guid-old'] });
    mockFetchResponse(RSS_BODY);

    const ctx = makeCtx({ readabilityEnabled: false });
    const inbox = makeInbox();
    const worker = new RSSWorker(ctx, store, inbox);

    const result = await worker.pollOne(feed.id);
    expect(result.ingested).toBe(2); // 2 new items ingested even though feed is disabled
  });
});
