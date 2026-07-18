// apps/mcp/src/tools/add-rss-feed.ts
import { z } from 'zod';
import Parser from 'rss-parser';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';

const inputSchema = z.object({
  url: z.string().url(),
  tags: z.array(z.string()).optional(),
  project: z.string().optional(),
});

export const definition = {
  name: 'add_rss_feed',
  description:
    'Subscribe MindBase to a new RSS feed. New entries are auto-fetched every 60 minutes and compiled into wiki pages. Use this when the user says things like "subscribe me to <url>", "follow this blog", "add this to my feeds", or shares a feed URL.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The RSS/Atom feed URL' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags applied to all entries from this feed',
      },
      project: {
        type: 'string',
        description: 'Optional project name to group entries under',
      },
    },
    required: ['url'],
  },
};

const probe = new Parser({ timeout: 15000 });

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  }
  const { url, tags, project } = parsed.data;

  try {
    // Probe the feed URL to validate it and get the feed title
    let feedTitle: string;
    let siteUrl: string | undefined;
    try {
      const probed = await probe.parseURL(url);
      feedTitle = probed.title ?? url;
      siteUrl = probed.link;
    } catch (e) {
      return errorResult(
        `Could not parse RSS feed at ${url}: ${(e as Error).message}`,
        'Make sure the URL is a valid RSS or Atom feed.',
      );
    }

    const feed = await ctx.feeds.add({
      url,
      name: feedTitle,
      site_url: siteUrl,
      tags: tags ?? [],
      project,
      interval_minutes: undefined,
    });

    return textResult({
      ok: true,
      feed: {
        id: feed.id,
        name: feed.name,
        url: feed.url,
        site_url: feed.site_url,
        tags: feed.tags,
        project: feed.project,
        added_at: feed.added_at,
      },
      message: `Subscribed to "${feed.name}". New entries will appear in your MindBase inbox within 60 minutes.`,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('already')) {
      return errorResult(
        `Already subscribed to this feed.`,
        'Use list_feeds to see your current subscriptions.',
      );
    }
    return errorResult(`Failed to add feed: ${msg}`);
  }
}

export function register(
  handlers: Map<string, (input: unknown) => Promise<unknown>>,
  defs: object[],
  ctx: Context,
): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
