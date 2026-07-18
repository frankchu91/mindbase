import { hybridSearch, buildSynthesisPrompt, validateSynthesis, hashMap } from '@mindbase/core';
import type { SynthesisResult } from '@mindbase/core';
import type { ServerContext } from '../context';
import { embed } from './embedder';
import { extractJson } from './extract-json';

function makePageStats(ctx: ServerContext) {
  return (slug: string) => {
    const p = ctx.wikiIndex.getPage(slug);
    if (!p) return null;
    return { inboundCount: p.inbound_count, updatedAt: p.updated_at, title: p.title };
  };
}

/**
 * Engine A — Synthesis. Given a topic (slug or free text), produces a
 * structured synthesis using the BYO-LLM adapter from ctx.
 *
 * Does NOT cache by itself — caller (route handler) reads cache first,
 * calls runSynthesis on miss, then writes cache.
 */
export async function runSynthesis(
  ctx: ServerContext,
  topic: string,
): Promise<SynthesisResult> {
  // 1. Retrieve top-20 candidate notes via hybrid search
  const hits = await hybridSearch({
    query: { q: topic, limit: 20 },
    searchIndex: ctx.searchIndex,
    embeddingStore: ctx.embeddingStore,
    embedFn: embed,
    store: ctx.store,
    k: 20,
    pageStats: makePageStats(ctx),
  });

  // 2. Load body for each hit
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
      } catch { /* meta missing — skip */ }
      notes.push({ slug, title, body, updated });
    } catch { /* note missing — skip */ }
  }

  if (notes.length === 0) {
    return {
      topic, generated_at: new Date().toISOString(),
      model: 'none', source_hashes: {}, summary: '',
      threads: [], contradictions: [], gaps: [],
    };
  }

  // 3. Build prompt + call LLM
  const adapter = ctx.getAdapter();
  // Detect dominant language — Chinese chars vs Latin
  const sampleText = notes.slice(0, 3).map((n) => n.body).join('\n').slice(0, 500);
  const chineseChars = (sampleText.match(/[一-鿿]/g) ?? []).length;
  const isChineseDominant = chineseChars > sampleText.length * 0.3;
  const langHint = isChineseDominant
    ? '\n\nIMPORTANT: The user\'s notes are in Chinese. Respond in Chinese.'
    : '';
  let schemaPreamble = '';
  try {
    schemaPreamble = await ctx.store.readText('schema/synthesis.md');
  } catch { /* default empty preamble */ }
  const prompt = buildSynthesisPrompt({ topic, notes, schemaPreamble }) + langHint;
  let buf = '';
  let llmError: string | null = null;
  for await (const chunk of adapter.chat({
    model: ctx.config.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2000,
    temperature: 0.3,
  })) {
    if (chunk.kind === 'delta') buf += chunk.text;
    else if (chunk.kind === 'error') llmError = chunk.error;
  }
  if (llmError) {
    console.warn(`[synthesis] LLM error for topic "${topic}": ${llmError}`);
  }

  // 4. Parse JSON — tolerant of prose wrappers from small models (llama3 etc).
  const raw = extractJson(buf);
  if (raw === null) {
    console.warn(`[synthesis] LLM returned unparseable output for topic "${topic}":`, buf.slice(0, 200));
    return {
      topic, generated_at: new Date().toISOString(),
      model: ctx.config.model, source_hashes: {}, summary: '',
      threads: [], contradictions: [], gaps: [],
    };
  }

  // 5. Validate
  const sourcesMap = new Map<string, string[]>(
    notes.map((n) => [n.slug, n.body.split('\n')]),
  );
  const validated = validateSynthesis(raw as Parameters<typeof validateSynthesis>[0], sourcesMap);

  // 6. Build source_hashes for cache invalidation
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
