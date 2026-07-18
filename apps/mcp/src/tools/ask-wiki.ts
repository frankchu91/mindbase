// apps/mcp/src/tools/ask-wiki.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import type { MetaJson } from '@mindbase/core';

const inputSchema = z.object({
  question: z.string().min(1),
  context_pages: z.array(z.string()).optional(),
  max_pages: z.number().int().min(1).max(20).optional().default(8),
});

export const definition = {
  name: 'ask_wiki',
  description: 'Ask a natural-language question against the user\'s wiki. Performs graph-aware retrieval (search → top hits + their 1-hop wikilinks) and returns a cited answer using the configured LLM. Best tool for "what do I know about X?" questions. The answer text contains [N] citation markers — match each N to the corresponding entry in the citations array and render as a clickable link to mindbase_uri.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The natural-language question' },
      context_pages: { type: 'array', items: { type: 'string' }, description: 'Optional: explicit page slugs to include as context' },
      max_pages: { type: 'number', description: 'Cap on total pages read (default 8, max 20)' },
    },
    required: ['question'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { question, context_pages, max_pages } = parsed.data;
  if (!ctx.config) return errorResult('LLM not configured', 'Open MindBase Settings to configure your LLM.');

  try {
    const graph = ctx.wikiIndex.buildGraph();
    const seedSlugs = new Set<string>();

    // Seed: explicit context pages + top search hits
    if (context_pages) for (const s of context_pages) seedSlugs.add(s);
    const hits = ctx.searchIndex.search(question).slice(0, 5);
    for (const h of hits) {
      const slug = h.path
        .replace(/^projects\/[^/]+\/(sources\/(?:contributors\/[^/]+|research)|context\.md)\/?/, '')
        .replace(/^wiki\/notes\//, '')
        .replace(/\.md$/, '');
      seedSlugs.add(slug);
    }

    // Expand: each seed gets 1-hop wikilinks added
    const expanded = new Set(seedSlugs);
    for (const seed of seedSlugs) {
      for (const n of graph.outgoing.get(seed) ?? []) expanded.add(n);
      for (const n of graph.incoming.get(seed) ?? []) expanded.add(n);
    }

    // Cap
    const slugs = [...expanded].slice(0, max_pages);

    // Build context document
    let contextBlock = '';
    const citations: Array<{
      n: number;
      slug: string;
      title: string;
      one_liner?: string;
      mindbase_uri: string;
      relevance: number;
    }> = [];
    let i = 1;
    for (const slug of slugs) {
      try {
        const body = await ctx.store.readText(`wiki/notes/${slug}.md`);
        let title = slug;
        let one_liner: string | undefined;
        try {
          const m = await ctx.store.readJSON<MetaJson>(`wiki/notes/${slug}.meta.json`);
          title = m.title;
          one_liner = m.one_liner;
        } catch { /* ok */ }
        contextBlock += `\n\n## [${i}] ${title} (slug: ${slug})\n\n${body}`;
        citations.push({
          n: i,
          slug,
          title,
          one_liner,
          mindbase_uri: `mindbase://wiki/${slug}`,
          relevance: seedSlugs.has(slug) ? 1.0 : 0.5,
        });
        i++;
      } catch { /* skip */ }
    }

    if (citations.length === 0) {
      return errorResult('No relevant pages found', 'Try a different question or use search_wiki to explore.');
    }

    const adapter = ctx.getAdapter();
    const promptInstructions = `You are answering a question using the user's compiled wiki content provided below. Cite sources using bracket numbers [N] matching the section headers. Don't fabricate. If the wiki doesn't cover the answer, say so plainly.`;
    const userMessage = `${promptInstructions}\n\n# Wiki context${contextBlock}\n\n# Question\n\n${question}`;

    let answer = '';
    let usage = { input_tokens: 0, output_tokens: 0 };
    for await (const chunk of adapter.chat({
      model: ctx.config.model,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 2048,
      temperature: 0.3,
    })) {
      if (chunk.kind === 'delta') answer += chunk.text;
      if (chunk.kind === 'done') usage = chunk.usage;
      if (chunk.kind === 'error') return errorResult(`LLM error: ${chunk.error}`);
    }

    return textResult({
      answer: answer.trim(),
      citations,
      pages_read: slugs,
      tokens_used: usage,
    });
  } catch (e) {
    return errorResult(`ask_wiki failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
