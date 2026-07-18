// apps/mcp/src/tools/get-pulse.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import {
  buildContradictionPrompt,
  type PulseSnapshot,
  type PulseWeeklyWrite,
  type PulseStaleNote,
  type Contradiction,
  type MetaJson,
} from '@mindbase/core';

const inputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  refresh: z.boolean().optional().default(false),
});

export const definition = {
  name: 'get_pulse',
  description:
    "Get today's (or a specific date's) wiki pulse: weekly writes, new connections, contradictions, stale notes, SRS due count. Use to give the user a daily situational awareness of their knowledge base.",
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'ISO date YYYY-MM-DD (default: today)' },
      refresh: { type: 'boolean' },
    },
  },
};

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Late night.';
  if (h < 12) return 'Morning.';
  if (h < 18) return 'Afternoon.';
  return 'Evening.';
}

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
}

async function runCurationMCP(ctx: Context, date?: string): Promise<PulseSnapshot> {
  const now = new Date();
  const dateStr = date ?? now.toISOString().slice(0, 10);

  const weekly_writes: PulseWeeklyWrite[] = [];
  const stale_notes: PulseStaleNote[] = [];
  const recentBodies: Array<{ slug: string; title: string; body: string; updated: string }> = [];

  try {
    const entries = await ctx.store.listDir('wiki/notes');
    for (const e of entries) {
      if (e.kind !== 'file' || !e.name.endsWith('.meta.json')) continue;
      const slug = e.name.replace(/\.meta\.json$/, '');
      try {
        const meta = await ctx.store.readJSON<MetaJson>(`wiki/notes/${e.name}`);
        const ds = daysSince(meta.updated, now);
        if (ds <= 7) {
          weekly_writes.push({
            slug,
            title: meta.title,
            written_at: meta.updated,
            kind: meta.kind ?? 'concept',
          });
          if (recentBodies.length < 30) {
            try {
              const body = await ctx.store.readText(`wiki/notes/${slug}.md`);
              recentBodies.push({ slug, title: meta.title, body, updated: meta.updated });
            } catch { /* skip */ }
          }
        }
        if (
          ds >= 14 &&
          (meta.kind === 'note' ||
            meta.kind === undefined ||
            meta.kind === 'daily' ||
            meta.kind === 'person')
        ) {
          stale_notes.push({ slug, title: meta.title, days_since: ds, kind: meta.kind });
        }
      } catch { /* malformed meta */ }
    }
  } catch { /* notes dir missing */ }

  weekly_writes.sort((a, b) => b.written_at.localeCompare(a.written_at));
  stale_notes.sort((a, b) => b.days_since - a.days_since);

  const contradictions: Contradiction[] = [];
  if (ctx.config && recentBodies.length >= 3) {
    try {
      const adapter = ctx.getAdapter();
      const prompt = buildContradictionPrompt(recentBodies);
      let buf = '';
      for await (const chunk of adapter.chat({
        model: ctx.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.2,
      })) {
        if (chunk.kind === 'delta') buf += chunk.text;
      }
      const cleaned = buf.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned) as {
        contradictions?: Array<{
          note_a_slug?: string;
          note_b_slug?: string;
          note_a_claim?: string;
          note_b_claim?: string;
          confidence?: 'low' | 'medium' | 'high';
          explanation?: string;
        }>;
      };
      const known = new Set(recentBodies.map((n) => n.slug));
      for (const c of parsed.contradictions ?? []) {
        if (!c.note_a_slug || !c.note_b_slug) continue;
        if (!known.has(c.note_a_slug) || !known.has(c.note_b_slug)) continue;
        if (c.confidence !== 'medium' && c.confidence !== 'high') continue;
        contradictions.push({
          with_slug: c.note_b_slug,
          your_claim_excerpt: c.note_a_claim ?? '',
          conflicting_claim_excerpt: c.note_b_claim ?? '',
          confidence: c.confidence,
          explanation: c.explanation,
        });
        if (contradictions.length >= 5) break;
      }
    } catch { /* LLM failed */ }
  }

  let srs_due_count = 0;
  try {
    const { total } = await ctx.cards.findDue(now);
    srs_due_count = total;
  } catch { /* SRS may not be set up */ }

  return {
    generated_at: now.toISOString(),
    date: dateStr,
    greeting: greetingFor(now),
    weekly_writes: weekly_writes.slice(0, 5),
    new_connections: [],
    stale_notes: stale_notes.slice(0, 3),
    contradictions,
    gaps: [],
    srs_due_count,
  };
}

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success)
    return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { date, refresh } = parsed.data;
  try {
    const d = date ?? new Date().toISOString().slice(0, 10);
    if (!refresh) {
      const cached = await ctx.synthesisCache.readPulse(d);
      if (cached) return textResult(cached);
    }
    const result = await runCurationMCP(ctx, d);
    await ctx.synthesisCache.writePulse(d, result);
    return textResult(result);
  } catch (e) {
    return errorResult(`get_pulse failed: ${(e as Error).message}`);
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
