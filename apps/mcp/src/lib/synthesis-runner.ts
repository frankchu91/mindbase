// apps/mcp/src/lib/synthesis-runner.ts
// MCP-native synthesis runner. Uses keyword search instead of hybrid search
// (MCP has no embedding infra). Logic mirrors apps/server/src/lib/synthesis.ts.
import {
  buildSynthesisPrompt,
  validateSynthesis,
  hashMap,
  type SynthesisResult,
} from '@mindbase/core';
import type { Context } from '../context.js';

/** Normalize topic string → cache key (kebab slug). */
export function topicKey(topic: string): string {
  const s = topic
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length > 0 ? s : 'untitled';
}

export async function runSynthesisMCP(ctx: Context, topic: string): Promise<SynthesisResult> {
  if (!ctx.config) {
    return {
      topic,
      generated_at: new Date().toISOString(),
      model: 'none',
      source_hashes: {},
      summary: '',
      threads: [],
      contradictions: [],
      gaps: [],
    };
  }

  // Use keyword search to find relevant notes (MCP has no embedding infra)
  const hits = ctx.searchIndex.search(topic).slice(0, 20);

  const notes: Array<{ slug: string; title: string; body: string; updated: string }> = [];
  for (const h of hits) {
    const slug = h.path.replace(/^wiki\/notes\//, '').replace(/\.md$/, '');
    try {
      const body = await ctx.store.readText(`wiki/notes/${slug}.md`);
      let title = slug;
      let updated = new Date().toISOString();
      try {
        const meta = await ctx.store.readJSON<{ title?: string; updated?: string }>(
          `wiki/notes/${slug}.meta.json`,
        );
        title = meta.title ?? slug;
        updated = meta.updated ?? updated;
      } catch { /* meta missing */ }
      notes.push({ slug, title, body, updated });
    } catch { /* note missing */ }
  }

  if (notes.length === 0) {
    return {
      topic,
      generated_at: new Date().toISOString(),
      model: 'none',
      source_hashes: {},
      summary: '',
      threads: [],
      contradictions: [],
      gaps: [],
    };
  }

  const adapter = ctx.getAdapter();
  const prompt = buildSynthesisPrompt({ topic, notes });
  let buf = '';
  for await (const chunk of adapter.chat({
    model: ctx.config.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2000,
    temperature: 0.3,
  })) {
    if (chunk.kind === 'delta') buf += chunk.text;
  }

  let raw: unknown;
  try {
    const cleaned = buf.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    raw = JSON.parse(cleaned);
  } catch {
    return {
      topic,
      generated_at: new Date().toISOString(),
      model: ctx.config.model,
      source_hashes: {},
      summary: '',
      threads: [],
      contradictions: [],
      gaps: [],
    };
  }

  const sourcesMap = new Map<string, string[]>(
    notes.map((n) => [n.slug, n.body.split('\n')]),
  );
  const validated = validateSynthesis(
    raw as Parameters<typeof validateSynthesis>[0],
    sourcesMap,
  );
  const source_hashes = await hashMap(notes.map((n) => ({ slug: n.slug, body: n.body })));

  return {
    topic,
    generated_at: new Date().toISOString(),
    model: ctx.config.model,
    source_hashes,
    summary: validated.summary,
    threads: validated.threads,
    contradictions: validated.contradictions,
    gaps: validated.gaps,
  };
}
