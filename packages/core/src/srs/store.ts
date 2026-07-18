import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { ulid } from 'ulid';
import { applyRating, newCard } from './sm2';
import type { ReviewCard, Rating, SRSStats } from './types';

export class CardStore {
  private path: string;
  private cache: ReviewCard[] | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'srs', 'cards.json');
  }

  async list(opts: { include_archived?: boolean } = {}): Promise<ReviewCard[]> {
    const all = await this.load();
    return opts.include_archived ? [...all] : all.filter(c => !c.archived);
  }

  async findDue(now: Date = new Date(), limit = 50): Promise<{ cards: ReviewCard[]; total: number }> {
    const all = await this.list();
    const due = all.filter(c => new Date(c.due_at).getTime() <= now.getTime());
    return { cards: due.slice(0, limit), total: due.length };
  }

  async findBySource(slug: string): Promise<ReviewCard[]> {
    const all = await this.list({ include_archived: true });
    return all.filter(c => c.source_slug === slug);
  }

  async findById(id: string): Promise<ReviewCard | null> {
    const all = await this.load();
    return all.find(c => c.id === id) ?? null;
  }

  async create(input: { question: string; answer: string; source_slug?: string; source_excerpt?: string; tags?: string[]; created_via?: 'auto' | 'manual'; }): Promise<ReviewCard> {
    const all = await this.load();
    const card = newCard({ id: ulid(), ...input });
    all.push(card);
    await this.save(all);
    return card;
  }

  async update(id: string, patch: Partial<Pick<ReviewCard, 'question' | 'answer' | 'tags' | 'archived'>>): Promise<ReviewCard> {
    const all = await this.load();
    const card = all.find(c => c.id === id);
    if (!card) throw new Error('card not found');
    Object.assign(card, patch);
    if (patch.archived === true && !card.archived_at) card.archived_at = new Date().toISOString();
    if (patch.archived === false) card.archived_at = undefined;
    await this.save(all);
    return card;
  }

  async answer(id: string, rating: Rating, now: Date = new Date()): Promise<ReviewCard> {
    const all = await this.load();
    const card = all.find(c => c.id === id);
    if (!card) throw new Error('card not found');
    const updated = applyRating(card, rating, now);
    Object.assign(card, updated);
    await this.save(all);
    return card;
  }

  async delete(id: string): Promise<void> {
    const all = await this.load();
    const next = all.filter(c => c.id !== id);
    await this.save(next);
  }

  async stats(now: Date = new Date()): Promise<SRSStats> {
    const all = await this.load();
    const stats: SRSStats = { total: all.length, due: 0, mastered: 0, archived: 0, learning: 0, by_tag: {} };
    for (const c of all) {
      if (c.archived) { stats.archived++; continue; }
      if (new Date(c.due_at).getTime() <= now.getTime()) stats.due++;
      if (c.repetitions >= 5 && c.interval >= 90) stats.mastered++;
      else if (c.repetitions < 5) stats.learning++;
      for (const t of c.tags) stats.by_tag[t] = (stats.by_tag[t] ?? 0) + 1;
    }
    return stats;
  }

  /** Daily-cap helper. */
  async countCreatedSince(since: Date): Promise<number> {
    const all = await this.load();
    return all.filter(c => new Date(c.created_at).getTime() >= since.getTime()).length;
  }

  private async load(): Promise<ReviewCard[]> {
    if (this.cache) return this.cache;
    try {
      const buf = await fs.readFile(this.path, 'utf8');
      const parsed = JSON.parse(buf);
      this.cache = Array.isArray(parsed?.cards) ? parsed.cards : [];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') this.cache = [];
      else throw e;
    }
    return this.cache!;
  }

  private async save(all: ReviewCard[]): Promise<void> {
    this.cache = all;
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify({ cards: all }, null, 2));
  }
}
