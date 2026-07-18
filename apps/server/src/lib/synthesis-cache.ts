import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { SynthesisResult, NetworkView, PulseSnapshot } from '@mindbase/core';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/i;
function assertSafeKey(k: string): void {
  if (!SLUG_RE.test(k) || k.includes('..')) throw new Error(`invalid cache key: '${k}'`);
}

/**
 * File-based cache for the three Active Wiki engines.
 *
 * Layout under dataDir:
 *   synthesis/<topic-key>.json     — Engine A results
 *   synthesis/.stale               — newline-separated topic keys to re-run
 *   synthesis/.reverse-index.json  — slug → [topic-key,...]
 *   network/<slug>.json            — Engine C results
 *   pulse/<YYYY-MM-DD>.json        — Engine B results
 */
export class SynthesisCache {
  private synthDir: string;
  private networkDir: string;
  private pulseDir: string;

  constructor(dataDir: string) {
    this.synthDir = join(dataDir, 'synthesis');
    this.networkDir = join(dataDir, 'network');
    this.pulseDir = join(dataDir, 'pulse');
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.synthDir, { recursive: true });
    await fs.mkdir(this.networkDir, { recursive: true });
    await fs.mkdir(this.pulseDir, { recursive: true });
  }

  // ── Synthesis ─────────────────────────────────────────────────────────

  async readSynthesis(topicKey: string): Promise<SynthesisResult | null> {
    assertSafeKey(topicKey);
    try {
      const raw = await fs.readFile(join(this.synthDir, `${topicKey}.json`), 'utf8');
      return JSON.parse(raw) as SynthesisResult;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async writeSynthesis(topicKey: string, data: SynthesisResult): Promise<void> {
    assertSafeKey(topicKey);
    await this.ensureDirs();
    await fs.writeFile(
      join(this.synthDir, `${topicKey}.json`),
      JSON.stringify(data, null, 2),
      'utf8',
    );
    await this.rebuildReverseIndex();
  }

  /** Mark all synthesis entries that cite this slug as stale. */
  async markStaleFor(slug: string): Promise<void> {
    const keys = await this.topicKeysFor(slug);
    if (keys.length === 0) return;
    await this.ensureDirs();
    const existing = await this.listStale();
    const set = new Set([...existing, ...keys]);
    await fs.writeFile(
      join(this.synthDir, '.stale'),
      [...set].join('\n') + '\n',
      'utf8',
    );
  }

  async listStale(): Promise<string[]> {
    try {
      const raw = await fs.readFile(join(this.synthDir, '.stale'), 'utf8');
      return raw.split('\n').filter(Boolean);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async clearStale(topicKey: string): Promise<void> {
    const list = await this.listStale();
    const next = list.filter((k) => k !== topicKey);
    await this.ensureDirs();
    await fs.writeFile(join(this.synthDir, '.stale'), next.join('\n') + '\n', 'utf8');
  }

  /** Reverse index: which topic-key caches mention this slug? */
  async topicKeysFor(slug: string): Promise<string[]> {
    try {
      const raw = await fs.readFile(join(this.synthDir, '.reverse-index.json'), 'utf8');
      const idx = JSON.parse(raw) as Record<string, string[]>;
      return idx[slug] ?? [];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  private async rebuildReverseIndex(): Promise<void> {
    const idx: Record<string, string[]> = {};
    let files: string[] = [];
    try { files = await fs.readdir(this.synthDir); } catch { return; }
    for (const f of files) {
      if (!f.endsWith('.json') || f.startsWith('.')) continue;
      const key = f.replace(/\.json$/, '');
      try {
        const raw = await fs.readFile(join(this.synthDir, f), 'utf8');
        const data = JSON.parse(raw) as SynthesisResult;
        for (const slug of Object.keys(data.source_hashes ?? {})) {
          (idx[slug] ||= []).push(key);
        }
      } catch { /* skip malformed */ }
    }
    await fs.writeFile(
      join(this.synthDir, '.reverse-index.json'),
      JSON.stringify(idx, null, 2),
      'utf8',
    );
  }

  // ── Network ───────────────────────────────────────────────────────────

  async readNetwork(slug: string): Promise<NetworkView | null> {
    assertSafeKey(slug);
    try {
      const raw = await fs.readFile(join(this.networkDir, `${slug}.json`), 'utf8');
      return JSON.parse(raw) as NetworkView;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async writeNetwork(slug: string, data: NetworkView): Promise<void> {
    assertSafeKey(slug);
    await this.ensureDirs();
    await fs.writeFile(
      join(this.networkDir, `${slug}.json`),
      JSON.stringify(data, null, 2),
      'utf8',
    );
  }

  // ── Pulse ─────────────────────────────────────────────────────────────

  async readPulse(date: string): Promise<PulseSnapshot | null> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`invalid date: ${date}`);
    try {
      const raw = await fs.readFile(join(this.pulseDir, `${date}.json`), 'utf8');
      return JSON.parse(raw) as PulseSnapshot;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async writePulse(date: string, data: PulseSnapshot): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`invalid date: ${date}`);
    await this.ensureDirs();
    await fs.writeFile(
      join(this.pulseDir, `${date}.json`),
      JSON.stringify(data, null, 2),
      'utf8',
    );
  }

  /**
   * Invalidate a cached pulse snapshot. Called by note-mutation routes so
   * PulseHome's "this week you wrote" list reflects deletes/renames/creates
   * without waiting for the daily refresh. `date` defaults to today.
   */
  async invalidatePulse(date?: string): Promise<void> {
    const d = date ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    await fs.rm(join(this.pulseDir, `${d}.json`), { force: true });
  }
}
