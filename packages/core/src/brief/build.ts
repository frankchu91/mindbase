/**
 * Core brief-building logic — pure data gathering + LLM call.
 * No email/nodemailer (server-only). Used by both apps/server and apps/mcp.
 */
import type { Store } from '../storage/store';
import type { LLMAdapter } from '../adapters/types';
import type { MetaJson, ChatMessage } from '../types';
import type { CardStore } from '../srs/store';
import { listAllWikiPages } from '../storage/paths';

export interface BriefSection {
  heading: string;
  content: string; // markdown text with [N] markers
}

export interface CitedSource {
  n: number;
  slug: string;
  title: string;
  path: string;
  one_liner: string;
}

export interface BriefRecord {
  date: string;         // YYYY-MM-DD in user tz
  generated_at: string; // ISO
  summary: string;      // markdown, ~200 words, has [N] markers
  sections: BriefSection[];
  on_this_day?: BriefSection;
  inbox_pending?: number;
  review_pending?: number;
  citations: CitedSource[];
  status?: 'sent' | 'failed' | 'preview-only';
  error?: string;
  message_id?: string;
}

interface PageCandidate {
  slug: string;
  title: string;
  one_liner: string;
  body_excerpt: string;
  updated: string;
}

/**
 * Options for buildBrief. Accepts the minimal interface needed so both
 * apps/server (ServerContext) and apps/mcp (Context) can call it.
 */
export interface BuildBriefContext {
  store: Store;
  getAdapter: () => LLMAdapter;
  config: { model: string };
  inbox?: {
    list: () => Promise<Array<{ status: string }>>;
  };
  cards?: CardStore;
  publicUrl?: string;
}

export interface BuildBriefOpts {
  sinceHours?: number;
  includeOnThisDay?: boolean;
  includeQuiz?: boolean;
}

/** Read pages updated/created in the past sinceHours hours, capped at maxPages. */
async function gatherRecentPages(
  store: Store,
  sinceHours: number,
  maxPages = 12,
): Promise<PageCandidate[]> {
  const cutoff = Date.now() - sinceHours * 3600_000;
  const candidates: PageCandidate[] = [];

  const entries = await listAllWikiPages(store);

  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.meta.json')) continue;
    const slug = entry.name.replace(/\.meta\.json$/, '');
    try {
      const meta = await store.readJSON<MetaJson>(`wiki/${entry.layer}/${entry.name}`);
      const updatedMs = new Date(meta.updated).getTime();
      if (!Number.isFinite(updatedMs) || updatedMs < cutoff) continue;

      // Read the body for a short excerpt
      let body_excerpt = '';
      try {
        const body = await store.readText(`wiki/${entry.layer}/${slug}.md`);
        body_excerpt = body.slice(0, 200).replace(/\n+/g, ' ').trim();
      } catch { /* skip */ }

      candidates.push({
        slug,
        title: meta.title,
        one_liner: meta.one_liner ?? '',
        body_excerpt,
        updated: meta.updated,
      });
    } catch { /* skip malformed */ }
  }

  // Sort newest first
  candidates.sort((a, b) => b.updated.localeCompare(a.updated));
  return candidates.slice(0, maxPages);
}

/** Find a page updated on a 1-week, 1-month or 1-year anniversary (UTC date match). */
async function findOnThisDay(store: Store): Promise<PageCandidate | null> {
  const now = new Date();
  const targets: Date[] = [
    new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
    new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
    new Date(now.getTime() - 7 * 86400_000),
  ];
  // Prefer 1-year > 1-month > 1-week
  const targetDates = targets.map((d) => d.toISOString().slice(0, 10));

  const entries = await listAllWikiPages(store);
  const byDate = new Map<string, PageCandidate>();

  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.meta.json')) continue;
    const slug = entry.name.replace(/\.meta\.json$/, '');
    try {
      const meta = await store.readJSON<MetaJson>(`wiki/${entry.layer}/${entry.name}`);
      const createdDate = meta.created.slice(0, 10);
      if (!targetDates.includes(createdDate)) continue;
      if (byDate.has(createdDate)) continue; // keep first found per date

      let body_excerpt = '';
      try {
        const body = await store.readText(`wiki/${entry.layer}/${slug}.md`);
        body_excerpt = body.slice(0, 200).replace(/\n+/g, ' ').trim();
      } catch { /* skip */ }

      byDate.set(createdDate, {
        slug,
        title: meta.title,
        one_liner: meta.one_liner ?? '',
        body_excerpt,
        updated: meta.updated,
      });
    } catch { /* skip malformed */ }
  }

  // Return highest-priority match (1-year > 1-month > 1-week)
  for (const d of targetDates) {
    const match = byDate.get(d);
    if (match) return match;
  }
  return null;
}

/** Build the numbered context block the LLM sees, and the CitedSource[] array. */
function buildContext(pages: PageCandidate[]): { contextBlock: string; citations: CitedSource[] } {
  const citations: CitedSource[] = [];
  const lines: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const n = i + 1;
    const p = pages[i]!;
    citations.push({
      n,
      slug: p.slug,
      title: p.title,
      path: `wiki/notes/${p.slug}.md`,
      one_liner: p.one_liner,
    });
    lines.push(`[${n}] ${p.title} (slug: ${p.slug}) — ${p.one_liner}`);
    if (p.body_excerpt) {
      lines.push(p.body_excerpt);
    }
    lines.push('');
  }

  return { contextBlock: lines.join('\n'), citations };
}

const BRIEF_SYSTEM_PROMPT = `You are writing a 200-word morning brief for the user about what they captured recently.

Constraints:
- Hard cap 200 words for the main summary, plus optional headers
- Group by theme, not chronologically
- EVERY factual claim must end with [N] referring to the numbered sources below
- Use [1][3] for multi-source claims
- If nothing was captured, write a one-line nudge instead: "Quiet day — nothing in your inbox"
- Don't mention dates ("yesterday's", "today's") — use "you wrote", "you captured", "you noted"
- Sound like a knowledgeable friend, not a press release
- Output only the brief text, no preamble`;

export async function buildBrief(
  ctx: BuildBriefContext,
  opts: BuildBriefOpts = {},
): Promise<BriefRecord> {
  const sinceHours = opts.sinceHours ?? 24;
  const today = new Date().toISOString().slice(0, 10);
  const generated_at = new Date().toISOString();

  // 1. Gather recent pages
  const recentPages = await gatherRecentPages(ctx.store, sinceHours);

  // 2. Inbox pending count (optional — only if ctx.inbox is present)
  let inbox_pending: number | undefined;
  if (ctx.inbox) {
    try {
      const entries = await ctx.inbox.list();
      const count = entries.filter((e) => e.status === 'queued').length;
      inbox_pending = count > 0 ? count : undefined;
    } catch { /* ignore */ }
  }

  // 2b. SRS due count (optional — only if ctx.cards is present)
  let review_pending: number | undefined;
  if (ctx.cards) {
    try {
      const stats = await ctx.cards.stats();
      review_pending = stats.due > 0 ? stats.due : undefined;
    } catch { /* ignore */ }
  }

  // 3. On-this-day (optional)
  let onThisDayPage: PageCandidate | null = null;
  if (opts.includeOnThisDay) {
    onThisDayPage = await findOnThisDay(ctx.store);
  }

  // 4. Build context block + citations
  const allPages = [...recentPages];
  // on-this-day page gets its own citation at the end if not already in recentPages
  let onThisDayCitation: CitedSource | null = null;
  if (onThisDayPage && !allPages.find((p) => p.slug === onThisDayPage!.slug)) {
    allPages.push(onThisDayPage);
  }

  const { contextBlock, citations } = buildContext(allPages);

  if (onThisDayPage) {
    onThisDayCitation = citations.find((c) => c.slug === onThisDayPage!.slug) ?? null;
  }

  // 5. If no pages, return a minimal brief
  if (recentPages.length === 0) {
    const brief: BriefRecord = {
      date: today,
      generated_at,
      summary: 'Quiet day — nothing was captured in the past 24 hours.',
      sections: [],
      inbox_pending,
      review_pending,
      citations: [],
      status: 'preview-only',
    };
    return brief;
  }

  // 6. Build the LLM prompt
  let userContent = `Sources:\n${contextBlock}`;
  if (inbox_pending) {
    userContent += `\nInbox: ${inbox_pending} unprocessed capture${inbox_pending === 1 ? '' : 's'} pending.`;
  }
  if (onThisDayPage && onThisDayCitation) {
    userContent += `\n\nOn this day (${new Date().toISOString().slice(0, 10)}): You wrote [${onThisDayCitation.n}] "${onThisDayPage.title}" exactly one year/month/week ago.`;
  }

  const messages: ChatMessage[] = [
    { role: 'user', content: BRIEF_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  // 7. Call LLM — collect streamed response
  let summary = '';
  let llmError: string | undefined;

  try {
    const adapter = ctx.getAdapter();
    const stream = adapter.chat({
      model: ctx.config.model,
      messages,
      max_tokens: 600,
      temperature: 0.4,
    });

    for await (const chunk of stream) {
      if (chunk.kind === 'delta') {
        summary += chunk.text;
      } else if (chunk.kind === 'error') {
        llmError = chunk.error;
        break;
      }
    }
  } catch (e) {
    llmError = (e as Error).message;
  }

  if (llmError || !summary.trim()) {
    return {
      date: today,
      generated_at,
      summary: '',
      sections: [],
      inbox_pending,
      review_pending,
      citations,
      status: 'failed',
      error: llmError ?? 'LLM returned empty response',
    };
  }

  // 8. Build on_this_day section if present
  let on_this_day: BriefSection | undefined;
  if (onThisDayPage && onThisDayCitation) {
    on_this_day = {
      heading: 'On This Day',
      content: `You wrote [${onThisDayCitation.n}] "${onThisDayPage.title}" — ${onThisDayPage.one_liner}`,
    };
  }

  return {
    date: today,
    generated_at,
    summary: summary.trim(),
    sections: [],
    on_this_day,
    inbox_pending,
    review_pending,
    citations,
    status: 'preview-only',
  };
}
