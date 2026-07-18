import type { ServerContext } from '../context';
import type { CardStore } from '@mindbase/core';
import { extractCards, paths } from '@mindbase/core';
import type { MetaJson } from '@mindbase/core';

export class SRSExtractor {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private ctx: ServerContext,
    private cards: CardStore,
    private intervalMs: number = 6 * 60 * 60 * 1000,
  ) {}

  start(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Run one extraction cycle: scan wiki for pages without cards. */
  async tick(): Promise<{ pagesScanned: number; pagesExtracted: number; cardsCreated: number; errors: string[] }> {
    if (this.running) return { pagesScanned: 0, pagesExtracted: 0, cardsCreated: 0, errors: [] };
    const cfg = this.ctx.config.srs;
    if (!cfg?.enabled || !cfg.autoExtract) return { pagesScanned: 0, pagesExtracted: 0, cardsCreated: 0, errors: [] };

    this.running = true;
    let pagesScanned = 0, pagesExtracted = 0, cardsCreated = 0;
    const errors: string[] = [];

    try {
      const dailyLimit = cfg.newCardsPerDayLimit ?? 20;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let createdToday = await this.cards.countCreatedSince(since);

      const entries = await paths.listAllWikiPages(this.ctx.store);
      for (const e of entries) {
        if (e.kind !== 'file' || !e.name.endsWith('.meta.json')) continue;
        if (createdToday >= dailyLimit) break;
        pagesScanned++;
        const slug = e.name.replace('.meta.json', '');
        const existing = await this.cards.findBySource(slug);
        if (existing.length > 0) continue;
        try {
          const created = await this.extractOne(slug);
          if (created.length > 0) {
            pagesExtracted++;
            cardsCreated += created.length;
            createdToday += created.length;
          }
        } catch (err) {
          errors.push(`${slug}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
    return { pagesScanned, pagesExtracted, cardsCreated, errors };
  }

  /** Force-extract from one page. Used by the API endpoint. */
  async extractOne(slug: string): Promise<Array<{ id: string }>> {
    const cfg = this.ctx.config.srs;
    if (!cfg) throw new Error('SRS not configured');
    const max = cfg.cardsPerPage ?? 3;
    const located = await paths.findWikiPagePath(
      async (p) => this.ctx.store.exists(p),
      slug,
    );
    if (!located) throw new Error(`wiki page not found: ${slug}`);
    const meta = await this.ctx.store.readJSON<MetaJson & { tags?: string[] }>(located.meta);
    const body = await this.ctx.store.readText(located.md);
    const adapter = this.ctx.getAdapter();
    const extracted = await extractCards({
      adapter,
      model: cfg.extractionModel ?? this.ctx.config.model,
      page: { title: meta.title, one_liner: meta.one_liner, body, slug },
      max_cards: max,
    });
    const created = [];
    for (const c of extracted) {
      const card = await this.cards.create({
        question: c.question,
        answer: c.answer,
        source_slug: slug,
        source_excerpt: c.excerpt,
        tags: meta.tags ?? [],
        created_via: 'auto',
      });
      created.push({ id: card.id });
    }
    return created;
  }
}
