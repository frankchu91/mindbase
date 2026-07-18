import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface CachedEmbedding {
  slug: string;
  content_hash: string; // SHA256 of (title + body), invalidates on edit
  vector: number[];     // 1024-dim float
  model: string;        // 'Xenova/bge-m3'
  computed_at: string;  // ISO timestamp
}

/**
 * File-per-page embedding cache.
 * Each page's embedding is stored at <dataDir>/embeddings/<slug>.json.
 */
export class EmbeddingStore {
  private dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'embeddings');
  }

  private slugPath(slug: string): string {
    // Prevent path traversal
    const safe = slug.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return path.join(this.dir, `${safe}.json`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  /** Hash title+body together for invalidation */
  static contentHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /** Get a cached embedding for a slug, or null if not cached. */
  async get(slug: string): Promise<CachedEmbedding | null> {
    try {
      const raw = await fs.readFile(this.slugPath(slug), 'utf-8');
      return JSON.parse(raw) as CachedEmbedding;
    } catch {
      return null;
    }
  }

  /**
   * Store an embedding for a slug.
   * @param slug  Page slug
   * @param content  Title + body concatenated — used only for hashing
   * @param vector   1024-dim embedding
   */
  async set(slug: string, content: string, vector: number[]): Promise<void> {
    await this.ensureDir();
    const entry: CachedEmbedding = {
      slug,
      content_hash: EmbeddingStore.contentHash(content),
      vector,
      model: 'Xenova/bge-m3',
      computed_at: new Date().toISOString(),
    };
    await fs.writeFile(this.slugPath(slug), JSON.stringify(entry), 'utf-8');
  }

  /**
   * Returns true if the cached embedding hash matches the given content.
   * False if no cache entry or if content has changed.
   */
  async hashMatches(slug: string, content: string): Promise<boolean> {
    const cached = await this.get(slug);
    if (!cached) return false;
    return cached.content_hash === EmbeddingStore.contentHash(content);
  }

  /** List all cached embeddings. */
  async list(): Promise<CachedEmbedding[]> {
    try {
      await this.ensureDir();
      const files = await fs.readdir(this.dir);
      const results: CachedEmbedding[] = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(this.dir, f), 'utf-8');
          results.push(JSON.parse(raw) as CachedEmbedding);
        } catch { /* skip corrupt files */ }
      }
      return results;
    } catch {
      return [];
    }
  }

  /** Delete the embedding for a slug (e.g. when a page is deleted). */
  async delete(slug: string): Promise<void> {
    try {
      await fs.unlink(this.slugPath(slug));
    } catch { /* ignore if not found */ }
  }
}
