import type { ServerContext } from '../context';
import { runSynthesis } from './synthesis';

/**
 * Polls the synthesis .stale set every 5s and regenerates entries serially
 * (max 1 inflight). Errors clear the stale entry to avoid retry loops.
 */
export class SynthesisWorker {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inflight = false;

  constructor(private ctx: ServerContext) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => { void this.tick(); }, 5000);
  }

  stop(): void {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async tick(): Promise<void> {
    if (this.inflight) return;
    const stale = await this.ctx.synthesisCache.listStale();
    if (stale.length === 0) return;

    this.inflight = true;
    const key = stale[0]!;
    try {
      const result = await runSynthesis(this.ctx, key);
      await this.ctx.synthesisCache.writeSynthesis(key, result);
      await this.ctx.synthesisCache.clearStale(key);
    } catch (e) {
      console.warn(`[synthesis-worker] regen failed for ${key}:`, (e as Error).message);
      await this.ctx.synthesisCache.clearStale(key);
    } finally {
      this.inflight = false;
    }
  }
}
