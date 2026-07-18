/**
 * Server-side embeddings wrapper. Wraps the BGE-M3 model from @xenova/transformers.
 * This module MUST NOT be imported by the web bundle.
 * Lives here (apps/server) so Vite never sees it.
 */

import type { FeatureExtractionPipeline } from '@xenova/transformers';

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  const { pipeline } = await import('@xenova/transformers');
  extractor = (await pipeline('feature-extraction', 'Xenova/bge-m3')) as FeatureExtractionPipeline;
  return extractor;
}

export async function embed(text: string): Promise<number[]> {
  const fx = await getExtractor();
  const result = await fx(text.slice(0, 8000), { pooling: 'mean', normalize: true });
  return Array.from(result.data as Float32Array);
}

export function unloadExtractor(): void {
  extractor = null;
}
