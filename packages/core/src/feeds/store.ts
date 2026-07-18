import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

export interface Feed {
  id: string;
  url: string;
  name: string;
  site_url?: string;
  tags: string[];
  project?: string;
  enabled: boolean;
  interval_minutes?: number;
  added_at: string;
  last_polled_at?: string;
  last_success_at?: string;
  etag?: string;
  last_modified?: string;
  seen_guids: string[];               // capped to last 200
  items_ingested_total: number;
  items_ingested_24h: number;
  items_ingested_24h_window: string;  // ISO of when the 24h counter was last reset
  last_error?: string;
  error_count_24h: number;
}

export type FeedSummary = Omit<Feed, 'seen_guids' | 'etag' | 'last_modified'>;

export class FeedStore {
  private path: string;
  private cache: Feed[] | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'feeds.json');
  }

  async list(): Promise<Feed[]> {
    if (this.cache) return this.cache;
    try {
      const buf = await fs.readFile(this.path, 'utf8');
      const parsed = JSON.parse(buf);
      this.cache = Array.isArray(parsed?.feeds) ? parsed.feeds : [];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') this.cache = [];
      else throw e;
    }
    return this.cache!;
  }

  summaries(): Promise<FeedSummary[]> {
    return this.list().then(feeds =>
      feeds.map(({ seen_guids: _sg, etag: _e, last_modified: _lm, ...rest }) => rest),
    );
  }

  async add(
    input: Pick<Feed, 'url' | 'name' | 'tags' | 'project' | 'interval_minutes' | 'site_url'>,
  ): Promise<Feed> {
    const all = await this.list();
    if (all.some(f => f.url === input.url)) throw new Error('Feed already subscribed');
    const now = new Date().toISOString();
    const feed: Feed = {
      id: crypto.randomUUID(),
      url: input.url,
      name: input.name,
      site_url: input.site_url,
      tags: input.tags ?? [],
      project: input.project,
      enabled: true,
      interval_minutes: input.interval_minutes,
      added_at: now,
      seen_guids: [],
      items_ingested_total: 0,
      items_ingested_24h: 0,
      items_ingested_24h_window: now,
      error_count_24h: 0,
    };
    all.push(feed);
    await this.save(all);
    return feed;
  }

  async update(
    id: string,
    patch: Partial<Omit<Feed, 'id' | 'url' | 'added_at'>>,
  ): Promise<Feed> {
    const all = await this.list();
    const feed = all.find(f => f.id === id);
    if (!feed) throw new Error('Feed not found');
    Object.assign(feed, patch);
    await this.save(all);
    return feed;
  }

  async remove(id: string): Promise<void> {
    const all = await this.list();
    const next = all.filter(f => f.id !== id);
    await this.save(next);
  }

  async findById(id: string): Promise<Feed | null> {
    const all = await this.list();
    return all.find(f => f.id === id) ?? null;
  }

  /** Mark a successful poll; updates etag/last-modified/seen_guids/timestamps + counters. */
  async markPolled(
    id: string,
    opts: { etag?: string; lastModified?: string; newGuids: string[]; ingested: number },
  ): Promise<void> {
    const all = await this.list();
    const f = all.find(x => x.id === id);
    if (!f) return;
    const now = new Date().toISOString();
    f.last_polled_at = now;
    f.last_success_at = now;
    if (opts.etag !== undefined) f.etag = opts.etag;
    if (opts.lastModified !== undefined) f.last_modified = opts.lastModified;
    if (opts.newGuids.length > 0) {
      f.seen_guids = [...f.seen_guids, ...opts.newGuids].slice(-200);
    }
    f.items_ingested_total += opts.ingested;
    // 24h rolling counter
    const windowAge = Date.now() - new Date(f.items_ingested_24h_window).getTime();
    if (windowAge > 24 * 60 * 60 * 1000) {
      f.items_ingested_24h = opts.ingested;
      f.items_ingested_24h_window = now;
    } else {
      f.items_ingested_24h += opts.ingested;
    }
    f.last_error = undefined;
    await this.save(all);
  }

  async markError(id: string, error: string): Promise<void> {
    const all = await this.list();
    const f = all.find(x => x.id === id);
    if (!f) return;
    const now = new Date().toISOString();
    f.last_polled_at = now;
    f.last_error = error;
    f.error_count_24h = (f.error_count_24h ?? 0) + 1;
    await this.save(all);
  }

  private async save(all: Feed[]): Promise<void> {
    this.cache = all;
    await fs.writeFile(this.path, JSON.stringify({ feeds: all }, null, 2));
  }
}

/** Parse OPML XML into list of { title, xmlUrl }. Handles nested folders by flattening. */
export function parseOpml(xml: string): Array<{ title: string; xmlUrl: string }> {
  let parsed: ReturnType<XMLParser['parse']>;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseAttributeValue: false,
    });
    parsed = parser.parse(xml);
  } catch {
    return [];
  }
  const out: Array<{ title: string; xmlUrl: string }> = [];

  function walk(node: unknown): void {
    if (!node) return;
    const arr = Array.isArray(node) ? node : [node];
    for (const item of arr as Record<string, unknown>[]) {
      const xmlUrl = item['@_xmlUrl'];
      const title = item['@_title'] ?? item['@_text'] ?? xmlUrl;
      if (typeof xmlUrl === 'string' && xmlUrl.length > 0) {
        out.push({ title: String(title), xmlUrl });
      }
      // Recurse into nested outlines (folders)
      if (item['outline']) walk(item['outline']);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((parsed as any)?.opml?.body?.outline) walk((parsed as any).opml.body.outline);
  return out;
}
