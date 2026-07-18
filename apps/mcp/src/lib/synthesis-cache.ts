import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { SynthesisResult, PulseSnapshot } from '@mindbase/core';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/i;
function assertSafeKey(k: string): void {
  if (!SLUG_RE.test(k) || k.includes('..')) throw new Error(`invalid cache key: '${k}'`);
}

/**
 * File-based cache for the Active Wiki engines (MCP copy).
 *
 * Layout under dataDir:
 *   synthesis/<topic-key>.json     — Engine A results
 *   pulse/<YYYY-MM-DD>.json        — Engine B results
 */
export class SynthesisCache {
  private synthDir: string;
  private pulseDir: string;

  constructor(dataDir: string) {
    this.synthDir = join(dataDir, 'synthesis');
    this.pulseDir = join(dataDir, 'pulse');
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.synthDir, { recursive: true });
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
}
