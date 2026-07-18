import type {
  PulseSnapshot, PulseWeeklyWrite, PulseStaleNote, PulseNewConnection,
  Contradiction, MetaJson,
} from '@mindbase/core';
import { buildContradictionPrompt, paths } from '@mindbase/core';
import type { ServerContext } from '../context';
import { extractJson } from './extract-json';

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

export async function runCuration(ctx: ServerContext, date?: string): Promise<PulseSnapshot> {
  const now = new Date();
  const dateStr = date ?? now.toISOString().slice(0, 10);

  const weekly_writes: PulseWeeklyWrite[] = [];
  const stale_notes: PulseStaleNote[] = [];

  // Walk wiki/notes and gather meta
  const recentBodies: Array<{ slug: string; title: string; body: string; updated: string }> = [];
  try {
    const entries = await paths.listAllWikiPages(ctx.store);
    for (const e of entries) {
      if (e.kind !== 'file' || !e.name.endsWith('.meta.json')) continue;
      const slug = e.name.replace(/\.meta\.json$/, '');
      try {
        const meta = await ctx.store.readJSON<MetaJson>(`wiki/${e.layer}/${e.name}`);
        const ds = daysSince(meta.updated, now);
        if (ds <= 7) {
          weekly_writes.push({
            slug, title: meta.title, written_at: meta.updated,
            kind: meta.kind ?? 'concept',
          });
          if (recentBodies.length < 30) {
            try {
              const body = await ctx.store.readText(`wiki/${e.layer}/${slug}.md`);
              recentBodies.push({ slug, title: meta.title, body, updated: meta.updated });
            } catch { /* skip */ }
          }
        }
        if (ds >= 14 && (meta.kind === 'note' || meta.kind === undefined || meta.kind === 'daily' || meta.kind === 'person')) {
          stale_notes.push({ slug, title: meta.title, days_since: ds, kind: meta.kind });
        }
      } catch { /* malformed meta — skip */ }
    }
  } catch { /* notes dir missing — first run */ }

  weekly_writes.sort((a, b) => b.written_at.localeCompare(a.written_at));
  stale_notes.sort((a, b) => b.days_since - a.days_since);

  const contradictions: Contradiction[] = [];
  if (recentBodies.length >= 3) {
    try {
      const adapter = ctx.getAdapter();
      let schemaPreamble = '';
      try {
        schemaPreamble = await ctx.store.readText('schema/synthesis.md');
      } catch { /* default empty preamble */ }
      const prompt = buildContradictionPrompt({ notes: recentBodies, schemaPreamble });
      let buf = '';
      for await (const chunk of adapter.chat({
        model: ctx.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.2,
      })) {
        if (chunk.kind === 'delta') buf += chunk.text;
      }
      const parsed = extractJson<{
        contradictions?: Array<{
          note_a_slug?: string; note_b_slug?: string;
          note_a_claim?: string; note_b_claim?: string;
          confidence?: 'low' | 'medium' | 'high';
          explanation?: string;
        }>;
      }>(buf);
      if (!parsed) throw new Error('unparseable LLM output');
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
    } catch { /* LLM failed — leave empty */ }
  }

  let srs_due_count = 0;
  try {
    const { total } = await ctx.cards.findDue(now);
    srs_due_count = total;
  } catch { /* SRS may not be set up */ }

  const new_connections: PulseNewConnection[] = [];

  return {
    generated_at: now.toISOString(),
    date: dateStr,
    greeting: greetingFor(now),
    weekly_writes: weekly_writes.slice(0, 5),
    new_connections,
    stale_notes: stale_notes.slice(0, 3),
    contradictions,
    gaps: [],
    srs_due_count,
  };
}
