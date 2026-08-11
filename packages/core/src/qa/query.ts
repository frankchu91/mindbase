import type { LLMAdapter } from '../adapters/types';
import type { ChatMessage, ChatRequest, MetaJson, ToolCall } from '../types';
import type { Store } from '../storage/store';
import type { SearchIndex } from '../search/index';
import { readIndex } from '../compile/index_md';
import { conceptMetaPath } from '../storage/paths';

export interface AskOptions {
  question: string;
  store: Store;
  index: SearchIndex;
  adapter: LLMAdapter;
  model: string;
  max_iterations?: number;
  max_candidates?: number;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  maxSourceChars?: number; // budget for source content, derived from model context window
  /**
   * When provided, skip BM25 retrieval and use exactly these slugs as context.
   * Used by /api/search/ask to ground answers on the user's current search results.
   */
  forcedContextSlugs?: string[];
}

export interface CitedSource {
  n: number;
  slug: string;
  title: string;
  path: string;
  one_liner: string;
}

export type QAEvent =
  | { kind: 'progress'; phase: string; detail?: string }
  | { kind: 'sources'; sources: CitedSource[] }
  | { kind: 'delta'; text: string }
  /** Reasoning stream from thinking models — show as progress, not answer text. */
  | { kind: 'thinking'; text: string }
  | {
      kind: 'done';
      citations: Array<{ path: string; title: string }>;
      sources: CitedSource[];
      usage: { input_tokens: number; output_tokens: number };
    }
  | { kind: 'error'; error: string };

const READ_FILE_TOOL = {
  name: 'read_file',
  description: 'Read the full content of a wiki file. Use sparingly — only files you actually need.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Wiki file path, e.g. wiki/concepts/rag.md' },
    },
    required: ['path'],
  },
};

const FALLBACK_QA = `You are MindBase, the user's personal knowledge assistant.

EVERY factual claim in your answer MUST end with a citation marker like [1] or [2][5]. The candidate documents are listed with bracket numbers — use those EXACT numbers.

Multi-source claim: [1][3]. Single-source claim: [1]. Place markers at end of sentences, before the period.

If you cannot cite a claim from the sources provided, do not state the claim. If the wiki doesn't cover the answer, say so plainly without inventing facts.`;

async function loadQAInstructions(store: Store): Promise<string> {
  try {
    return await store.readText('schema/query.md');
  } catch {
    return FALLBACK_QA;
  }
}

interface CandidateSummary {
  path: string;
  title: string;
  one_liner: string;
}

async function loadCandidateSummaries(
  store: Store,
  paths: string[],
  excludeVisibility: string[] = ['pii'],
): Promise<CandidateSummary[]> {
  const out: CandidateSummary[] = [];
  for (const p of paths) {
    const slug = p.replace(/^wiki\/(?:concepts|notes|articles)\//, '').replace(/\.md$/, '');
    const metaP = conceptMetaPath(slug);
    try {
      const m = await store.readJSON<MetaJson>(metaP);
      if (m.visibility && excludeVisibility.includes(m.visibility)) continue;
      out.push({ path: p, title: m.title, one_liner: m.one_liner });
    } catch {
      out.push({ path: p, title: slug, one_liner: '' });
    }
  }
  return out;
}

export async function* askQuestion(opts: AskOptions): AsyncIterable<QAEvent> {
  const { question, store, index, adapter, model } = opts;
  const maxIter = opts.max_iterations ?? 3;
  const maxCands = opts.max_candidates ?? 6;

  // Tier 0: Read hot.md for recent context
  let hotContext = '';
  try {
    hotContext = await store.readText('wiki/hot.md');
    yield { kind: 'progress', phase: 'read_hot_cache' };
  } catch { /* no hot.md yet */ }

  yield { kind: 'progress', phase: 'read_index' };
  const indexContent = await readIndex(store);

  yield { kind: 'progress', phase: 'keyword_filter' };
  let candidates: CandidateSummary[];
  if (opts.forcedContextSlugs && opts.forcedContextSlugs.length > 0) {
    // Bypass retrieval — use the exact slugs the caller provides
    const paths = opts.forcedContextSlugs.map((s) => `wiki/notes/${s}.md`);
    candidates = await loadCandidateSummaries(store, paths);
  } else {
    const hits = index.search(question).slice(0, maxCands);
    candidates = await loadCandidateSummaries(store, hits.map((h) => h.path));
  }

  const numberedSources: CitedSource[] = candidates.map((c, i) => {
    const slug = c.path.replace(/^wiki\/(?:concepts|notes|articles)\//, '').replace(/\.md$/, '');
    return { n: i + 1, slug, title: c.title, path: c.path, one_liner: c.one_liner };
  });

  yield { kind: 'sources', sources: numberedSources };

  const shortContext = candidates.length
    ? candidates.map((c, i) => `[${i + 1}] ${c.title} (slug: ${c.path.replace(/^wiki\/(?:concepts|notes|articles)\//, '').replace(/\.md$/, '')}) — ${c.one_liner}`).join('\n')
    : '(no candidates matched)';

  // --- Three-tier source loading ---
  const MAX_SOURCE_CHARS = opts.maxSourceChars ?? 50000; // default ~50k chars, override via config
  let usedChars = 0;
  const sourceBlocks: string[] = [];

  // Helper: find raw file by ID across all date dirs
  async function findRawContent(rawId: string): Promise<string | null> {
    const rawEntries = await store.listDir('raw');
    for (const dayEntry of rawEntries) {
      if (dayEntry.kind !== 'directory') continue;
      try {
        return await store.readText(`raw/${dayEntry.name}/${rawId}.md`);
      } catch { /* not in this day dir */ }
    }
    return null;
  }

  yield { kind: 'progress', phase: 'loading_sources' };

  // TIER 1: Check conversation history for recent ingest raw IDs
  // If user just ingested something, that raw source is the most relevant
  const recentRawIds: string[] = [];
  if (opts.history) {
    for (const h of opts.history) {
      // Ingest confirmations contain raw IDs like "raw/abc123"
      const rawMatch = h.text.match(/raw\/([a-z0-9]+)/);
      if (rawMatch?.[1]) recentRawIds.push(rawMatch[1]);
    }
  }

  if (recentRawIds.length > 0) {
    for (const rawId of recentRawIds.slice(-2)) {
      const rawText = await findRawContent(rawId);
      if (rawText && usedChars + rawText.length < MAX_SOURCE_CHARS) {
        const truncated = rawText.slice(0, MAX_SOURCE_CHARS - usedChars);
        sourceBlocks.push(`--- Raw Source (from this conversation): ${rawId} ---\n${truncated}`);
        usedChars += truncated.length;
      }
    }
  }

  // TIER 2: Load wiki notes + their raw sources (if we have budget left)
  for (const cand of candidates.slice(0, 3)) {
    if (usedChars >= MAX_SOURCE_CHARS) break;
    try {
      const noteBody = await store.readText(cand.path);
      const noteTruncated = noteBody.slice(0, Math.min(3000, MAX_SOURCE_CHARS - usedChars));
      sourceBlocks.push(`--- Wiki Note: ${cand.title} ---\n${noteTruncated}`);
      usedChars += noteTruncated.length;

      // TIER 3: Load raw sources referenced by this wiki note
      if (usedChars < MAX_SOURCE_CHARS) {
        const slug = cand.path.replace(/^wiki\/(?:concepts|notes|articles)\//, '').replace(/\.md$/, '');
        try {
          const meta = await store.readJSON<MetaJson>(conceptMetaPath(slug));
          for (const rawId of (meta.sources ?? []).slice(0, 1)) {
            if (recentRawIds.includes(rawId)) continue; // already loaded in tier 1
            const rawText = await findRawContent(rawId);
            if (rawText && usedChars + 2000 < MAX_SOURCE_CHARS) {
              const truncated = rawText.slice(0, Math.min(3000, MAX_SOURCE_CHARS - usedChars));
              sourceBlocks.push(`--- Raw Source: ${rawId} ---\n${truncated}`);
              usedChars += truncated.length;
            }
          }
        } catch { /* no meta */ }
      }
    } catch { /* skip */ }
  }

  const fullContentStr = sourceBlocks.length > 0
    ? '\n\n' + sourceBlocks.join('\n\n')
    : '';

  const qaInstructions = await loadQAInstructions(store);

  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: `<system-reminder>\n${qaInstructions}\n</system-reminder>\n\n${hotContext ? `Recent activity:\n${hotContext}\n\n` : ''}Wiki INDEX.md:\n${indexContent}\n\nCandidate documents:\n${shortContext}${fullContentStr}`,
    },
  ];

  // Append conversation history
  if (opts.history && opts.history.length > 0) {
    const recent = opts.history.slice(-10);
    for (const h of recent) {
      messages.push({ role: h.role, content: h.text });
    }
  }

  // Add the current question
  messages.push({ role: 'user', content: question });

  const readFiles: Array<{ path: string; title: string }> = [];
  const totalUsage = { input_tokens: 0, output_tokens: 0 };

  for (let iter = 0; iter < maxIter; iter++) {
    yield { kind: 'progress', phase: 'llm_call', detail: `iteration ${iter + 1}` };
    const request: ChatRequest = {
      model,
      messages,
      tools: [READ_FILE_TOOL],
      max_tokens: 2048,
      temperature: 0.2,
    };

    const pendingCalls: ToolCall[] = [];
    let textCollected = '';
    let sawError = false;

    for await (const chunk of adapter.chat(request)) {
      switch (chunk.kind) {
        case 'delta':
          textCollected += chunk.text;
          yield { kind: 'delta', text: chunk.text };
          break;
        case 'thinking':
          yield { kind: 'thinking', text: chunk.text };
          break;
        case 'tool_call':
          pendingCalls.push(chunk.tool_call);
          break;
        case 'done':
          totalUsage.input_tokens += chunk.usage.input_tokens;
          totalUsage.output_tokens += chunk.usage.output_tokens;
          break;
        case 'error':
          sawError = true;
          yield { kind: 'error', error: chunk.error };
          break;
      }
    }

    if (sawError) return;

    if (pendingCalls.length === 0) {
      yield { kind: 'done', citations: readFiles, sources: numberedSources, usage: totalUsage };
      return;
    }

    messages.push({ role: 'assistant', content: textCollected });
    for (const call of pendingCalls) {
      if (call.name !== 'read_file') {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: JSON.stringify({ ok: false, error: 'unknown tool' }),
        });
        continue;
      }
      const path = (call.arguments.path ?? '') as string;
      let body = '';
      try {
        body = await store.readText(path);
        const slug = path.replace(/^wiki\/concepts\//, '').replace(/\.md$/, '');
        let title = slug;
        try {
          const m = await store.readJSON<MetaJson>(conceptMetaPath(slug));
          title = m.title;
        } catch {
          // fall back to slug
        }
        readFiles.push({ path, title });
      } catch (e) {
        body = `ERROR: ${(e as Error).message}`;
      }
      yield { kind: 'progress', phase: 'read_file', detail: path };
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: 'read_file',
        content: body,
      });
    }
  }

  yield { kind: 'done', citations: readFiles, sources: numberedSources, usage: totalUsage };
}
