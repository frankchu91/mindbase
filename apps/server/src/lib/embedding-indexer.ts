import type { ServerContext } from '../context';
import type { EmbeddingStore, MetaJson } from '@mindbase/core';
import { paths } from '@mindbase/core';
import { embed, unloadExtractor } from './embedder.js';

interface IndexStatus {
  indexed: number;
  total: number;
  current?: string;
}

/**
 * Background worker that maintains a dense embedding index for all wiki pages.
 *
 * - On start(): scans all wiki/notes pages and embeds any with a stale hash.
 * - On indexOne(slug): re-embeds a single page (call after save/compile).
 * - getStatus(): returns live progress for /api/search/index-status.
 *
 * NOTE: The BGE-M3 model (~570MB) is loaded lazily on first embed call.
 * indexAll() runs in the background — it does NOT block server boot.
 * After batch indexing, the extractor is unloaded to free ~600MB RAM.
 */
export class EmbeddingIndexer {
  private status: IndexStatus = { indexed: 0, total: 0 };

  constructor(
    private ctx: ServerContext,
    private store: EmbeddingStore,
  ) {}

  /**
   * Start background indexing. Returns immediately; indexAll runs in background.
   */
  start(): void {
    // Fire and forget — no await
    void this.indexAll().catch((e) => {
      console.error('[embedding-indexer] indexAll failed:', e);
    });
  }

  /**
   * Scan all wiki notes and embed any whose content hash has changed.
   * Runs batches of 5 pages in parallel.
   */
  async indexAll(): Promise<{ indexed: number; skipped: number; failed: number }> {
    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    const entries = await paths.listAllWikiPages(this.ctx.store);
    const mdFiles = entries.filter(
      (e) => e.kind === 'file' && e.name.endsWith('.md'),
    );
    this.status.total = mdFiles.length;
    this.status.indexed = 0;

    // Process in batches of 5
    const BATCH = 5;
    for (let i = 0; i < mdFiles.length; i += BATCH) {
      const batch = mdFiles.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (entry) => {
          const slug = entry.name.replace(/\.md$/, '');
          this.status.current = slug;
          try {
            const didEmbed = await this.embedIfStale(slug);
            if (didEmbed) indexed++;
            else skipped++;
          } catch (e) {
            console.warn(`[embedding-indexer] failed to embed ${slug}:`, (e as Error).message);
            failed++;
          }
          this.status.indexed++;
        }),
      );
    }

    this.status.current = undefined;

    // Release the ~600MB model from memory after batch indexing completes
    if (indexed > 0) {
      try {
        unloadExtractor();
      } catch { /* ok */ }
    }

    console.log(`[embedding-indexer] done: indexed=${indexed} skipped=${skipped} failed=${failed}`);
    return { indexed, skipped, failed };
  }

  /**
   * Re-embed a single page by slug. Call after wiki save or capture compile.
   * Fire-and-forget safe; errors are logged but not thrown.
   */
  async indexOne(slug: string): Promise<void> {
    try {
      await this.embedIfStale(slug);
    } catch (e) {
      console.warn(`[embedding-indexer] indexOne(${slug}) failed:`, (e as Error).message);
    }
  }

  /** Returns true if embedding was computed (content was stale), false if skipped. */
  private async embedIfStale(slug: string): Promise<boolean> {
    let title = slug;
    let body = '';

    const located = await paths.findWikiPagePath(
      async (p) => this.ctx.store.exists(p),
      slug,
    );
    if (!located) return false;

    try {
      const meta = await this.ctx.store.readJSON<MetaJson>(located.meta);
      title = meta.title ?? slug;
    } catch { /* ok */ }

    try {
      body = await this.readBodyWithOcr(located.md);
    } catch {
      return false; // no body, nothing to embed
    }

    const content = `${title}\n\n${body}`;
    if (await this.store.hashMatches(slug, content)) {
      return false; // already up to date
    }

    const vector = await embed(content);
    await this.store.set(slug, content, vector);
    return true;
  }

  getStatus(): IndexStatus {
    return { ...this.status };
  }

  /**
   * Read a wiki page's markdown body (from either layer — caller supplies the
   * resolved md path) and append OCR sidecar text for any embedded attachment
   * images. This lets semantic search match against text that lives inside
   * screenshots/photos rather than the note prose alone.
   */
  private async readBodyWithOcr(mdPath: string): Promise<string> {
    const raw = await this.ctx.store.readText(mdPath);
    const re = /\/api\/wiki\/attachments\/([^/)\s]+)\/([0-9a-f]+\.(?:png|jpg|jpeg|gif|webp))/gi;
    const matches = Array.from(raw.matchAll(re));
    if (matches.length === 0) return raw;
    const blocks: string[] = [];
    for (const m of matches) {
      const slugDir = m[1]!;
      const file = m[2]!;
      try {
        const txt = await this.ctx.store.readText(`attachments/${slugDir}/${file}.ocr.txt`);
        if (txt.trim().length > 0) blocks.push(txt.trim());
      } catch { /* skip */ }
    }
    return blocks.length > 0 ? `${raw}\n\n${blocks.join('\n\n')}` : raw;
  }
}
