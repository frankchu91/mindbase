import { Router } from 'express';
import { paths } from '@mindbase/core';
import type { ServerContext } from '../context';

interface EmbeddingResult {
  path: string;
  title: string;
  score: number;
}

/** Simple cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Call OpenAI-compatible embeddings endpoint */
async function getEmbeddings(
  texts: string[],
  config: { apiKey: string; baseUrl: string; model?: string },
): Promise<number[][]> {
  const baseUrl = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
  const url = `${baseUrl}/v1/embeddings`;
  const model = config.model || 'text-embedding-3-small';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!response.ok) {
    throw new Error(`Embeddings API error: ${response.status}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data.map((d) => d.embedding);
}

export function semanticSearchRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = req.query['q'] as string;
    if (!query?.trim()) {
      res.status(400).json({ error: 'q parameter required' });
      return;
    }

    try {
      // Load all wiki page contents from both layers (concepts + notes)
      const entries = await paths.listAllWikiPages(ctx.store);
      const pages: Array<{ slug: string; title: string; path: string; content: string }> = [];

      for (const entry of entries) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
        const slug = entry.name.replace(/\.md$/, '');
        const content = await ctx.store.readText(`wiki/${entry.layer}/${entry.name}`);
        let title = slug;
        try {
          const meta = await ctx.store.readJSON<{ title: string }>(`wiki/${entry.layer}/${slug}.meta.json`);
          title = meta.title;
        } catch { /* use slug */ }
        pages.push({ slug, title, path: `wiki/${entry.layer}/${slug}.md`, content: content.slice(0, 1000) });
      }

      if (pages.length === 0) {
        res.json({ results: [] });
        return;
      }

      // Get embeddings for query + all pages
      const texts = [query, ...pages.map((p) => `${p.title}: ${p.content}`)];
      const embeddings = await getEmbeddings(texts, {
        apiKey: ctx.config.apiKey,
        baseUrl: ctx.config.baseUrl,
      });

      const queryEmb = embeddings[0]!;
      const results: EmbeddingResult[] = pages.map((p, i) => ({
        path: p.path,
        title: p.title,
        score: cosineSimilarity(queryEmb, embeddings[i + 1]!),
      }));

      // Sort by similarity, return top 10
      results.sort((a, b) => b.score - a.score);
      res.json({ results: results.slice(0, 10) });
    } catch (e) {
      // Fallback: if embeddings not available, return empty with error hint
      res.status(500).json({
        error: `Semantic search requires an embeddings-capable API. ${(e as Error).message}`,
        hint: 'Use /api/search for full-text search instead.',
      });
    }
  });

  return router;
}
