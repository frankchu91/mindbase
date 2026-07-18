import type { Store } from '@mindbase/core';
import crypto from 'node:crypto';

export interface ManifestEntry {
  ingested_at: string;
  content_hash: string;
  source_url: string | null;
  title: string;
  pages_created: string[];
  pages_updated: string[];
  tokens_used: { input: number; output: number };
}

export interface Manifest {
  version: number;
  last_updated: string;
  sources: Record<string, ManifestEntry>;
  stats: {
    total_sources: number;
    total_tokens: { input: number; output: number };
  };
}

const MANIFEST_PATH = '.manifest.json';

export async function loadManifest(store: Store): Promise<Manifest> {
  try {
    return await store.readJSON<Manifest>(MANIFEST_PATH);
  } catch {
    return {
      version: 1,
      last_updated: new Date().toISOString(),
      sources: {},
      stats: { total_sources: 0, total_tokens: { input: 0, output: 0 } },
    };
  }
}

export async function saveManifest(store: Store, manifest: Manifest): Promise<void> {
  manifest.last_updated = new Date().toISOString();
  manifest.stats.total_sources = Object.keys(manifest.sources).length;
  await store.writeJSON(MANIFEST_PATH, manifest);
}

export function contentHash(text: string): string {
  return 'sha256:' + crypto.createHash('sha256').update(text).digest('hex');
}

export function isDuplicate(manifest: Manifest, hash: string): boolean {
  return Object.values(manifest.sources).some((e) => e.content_hash === hash);
}
