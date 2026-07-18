/**
 * BGE-M3 local embedding wrapper via @xenova/transformers.
 *
 * This module is SERVER-ONLY. It MUST NOT be imported by the web bundle.
 * The ~570MB BGE-M3 model is downloaded to ~/.cache/huggingface/ on first use
 * and cached on disk for subsequent loads.
 *
 * NOTE: No vitest tests for this file — model download is too slow for CI.
 * Manual smoke: `node -e "import('./dist/search/embeddings.js').then(m => m.embed('hello').then(v => console.log(v.length)))"`
 */

// Import type only — the actual runtime import is dynamic so bundlers don't pull it into web chunks
import type { FeatureExtractionPipeline } from '@xenova/transformers';

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  // Dynamic import keeps @xenova/transformers out of the web bundle
  const { pipeline } = await import('@xenova/transformers');
  // First call downloads ~570MB to ~/.cache/huggingface. Subsequent loads from disk.
  extractor = (await pipeline(
    'feature-extraction',
    'Xenova/bge-m3',
  )) as FeatureExtractionPipeline;
  return extractor;
}

/**
 * Embed a text string using BGE-M3. Returns a 1024-dim normalized float vector.
 * First call downloads the model (~570MB, ~30-60s). Subsequent calls use disk cache.
 */
export async function embed(text: string): Promise<number[]> {
  const fx = await getExtractor();
  // BGE-M3 supports up to ~8k tokens; slice by chars as a rough guard
  const truncated = text.slice(0, 8000);
  const result = await fx(truncated, { pooling: 'mean', normalize: true });
  return Array.from(result.data as Float32Array);
}

/**
 * Cosine similarity between two normalized vectors.
 * Since BGE-M3 outputs normalized vectors, this is just the dot product.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i]! * b[i]!;
  return dot;
}

/**
 * Release the loaded model from memory.
 * Call after batch indexing completes to free ~600MB of RAM.
 */
export function unloadExtractor(): void {
  extractor = null;
}
