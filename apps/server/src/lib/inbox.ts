import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulid';
import type { CaptureSurface } from '@mindbase/core';

export type CaptureType = 'url' | 'text' | 'image' | 'audio';
// Re-export for any callers that previously imported CaptureVia from this module.
export type { CaptureSurface as CaptureVia } from '@mindbase/core';
export type InboxStatus = 'queued' | 'processing' | 'compiled' | 'failed';

export interface InboxEntry {
  id: string;
  type: CaptureType;
  url?: string;
  title?: string;
  text?: string;
  note?: string;
  tags?: string[];
  project?: string;
  captured_at: string;
  captured_via: CaptureSurface;
  captured_device_id: string;
  status: InboxStatus;
  audio_path?: string;
  image_path?: string;
  client_dedup_key?: string;
  wiki_slug?: string;
  error?: string;
}

const DEDUP_WINDOW_MS = 5 * 60 * 1000;

export class Inbox {
  private queueDir: string;
  private processedDir: string;
  private failedDir: string;
  private recentKeys = new Map<string, number>();

  constructor(dataDir: string) {
    this.queueDir = join(dataDir, 'inbox');
    this.processedDir = join(dataDir, 'inbox', 'processed');
    this.failedDir = join(dataDir, 'inbox', 'failed');
  }

  private async ensureDirs() {
    await fs.mkdir(this.queueDir, { recursive: true });
    await fs.mkdir(this.processedDir, { recursive: true });
    await fs.mkdir(this.failedDir, { recursive: true });
  }

  async add(input: Omit<InboxEntry, 'id' | 'status'>): Promise<{ id: string; status: InboxStatus }> {
    await this.ensureDirs();
    if (input.client_dedup_key) {
      const seen = this.recentKeys.get(input.client_dedup_key);
      if (seen && Date.now() - seen < DEDUP_WINDOW_MS) {
        throw new Error('duplicate');
      }
      this.recentKeys.set(input.client_dedup_key, Date.now());
    }
    const id = ulid();
    const entry: InboxEntry = { ...input, id, status: 'queued' };
    await fs.writeFile(join(this.queueDir, `${id}.json`), JSON.stringify(entry, null, 2));
    return { id, status: 'queued' };
  }

  async list(): Promise<InboxEntry[]> {
    await this.ensureDirs();
    const all: InboxEntry[] = [];
    for (const dir of [this.queueDir, this.processedDir, this.failedDir]) {
      const files = await fs.readdir(dir);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const buf = await fs.readFile(join(dir, f), 'utf8');
        all.push(JSON.parse(buf));
      }
    }
    return all.sort((a, b) => b.captured_at.localeCompare(a.captured_at));
  }

  async pendingIds(): Promise<string[]> {
    await this.ensureDirs();
    const files = await fs.readdir(this.queueDir);
    return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  }

  async read(id: string): Promise<InboxEntry | null> {
    for (const dir of [this.queueDir, this.processedDir, this.failedDir]) {
      try {
        const buf = await fs.readFile(join(dir, `${id}.json`), 'utf8');
        return JSON.parse(buf);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
    return null;
  }

  async markProcessing(id: string) {
    const entry = await this.read(id);
    if (entry) {
      entry.status = 'processing';
      await fs.writeFile(join(this.queueDir, `${id}.json`), JSON.stringify(entry, null, 2));
    }
  }

  async markCompiled(id: string, wikiSlug: string) {
    const entry = await this.read(id);
    if (!entry) return;
    entry.status = 'compiled';
    entry.wiki_slug = wikiSlug;
    await fs.writeFile(join(this.processedDir, `${id}.json`), JSON.stringify(entry, null, 2));
    await fs.unlink(join(this.queueDir, `${id}.json`)).catch(() => {});
  }

  async markFailed(id: string, error: string) {
    const entry = await this.read(id);
    if (!entry) return;
    entry.status = 'failed';
    entry.error = error;
    await fs.writeFile(join(this.failedDir, `${id}.json`), JSON.stringify(entry, null, 2));
    await fs.unlink(join(this.queueDir, `${id}.json`)).catch(() => {});
  }

  async delete(id: string) {
    for (const dir of [this.queueDir, this.processedDir, this.failedDir]) {
      await fs.unlink(join(dir, `${id}.json`)).catch(() => {});
    }
  }
}
