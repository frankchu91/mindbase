import type { ServerContext } from '../context';
import { runAnalysis, runContradictionProbe } from '@mindbase/core';

const DAILY_MS = 24 * 60 * 60 * 1000;

export class AnalysisScheduler {
  private analysisTimer: NodeJS.Timeout | undefined;
  private probeTimer: NodeJS.Timeout | undefined;
  private firstProbeTimer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private ctx: ServerContext) {}

  /**
   * Start periodic runs. Runs the detectors immediately if the cache is
   * stale (older than 1 day), then schedules subsequent runs every 24h.
   * Contradiction probe runs every 24h, with the first run scheduled
   * 60s after startup to avoid a boot spike.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    void this.runDetectorsIfStale();
    this.analysisTimer = setInterval(() => { void this.runDetectorsIfStale(); }, DAILY_MS);

    this.firstProbeTimer = setTimeout(() => { void this.runProbeIfDue(); }, 60_000);
    this.probeTimer = setInterval(() => { void this.runProbeIfDue(); }, DAILY_MS);

    console.log('[analysis] scheduler started');
  }

  stop(): void {
    if (this.analysisTimer) clearInterval(this.analysisTimer);
    if (this.probeTimer) clearInterval(this.probeTimer);
    if (this.firstProbeTimer) clearTimeout(this.firstProbeTimer);
    this.analysisTimer = undefined;
    this.probeTimer = undefined;
    this.firstProbeTimer = undefined;
    this.running = false;
  }

  async runNow(): Promise<void> {
    await runAnalysis({ store: this.ctx.store, wikiIndex: this.ctx.wikiIndex });
  }

  async runProbeNow(): Promise<{ judged: number; cached: number }> {
    const adapter = this.ctx.getAdapter();
    return runContradictionProbe({
      store: this.ctx.store,
      wikiIndex: this.ctx.wikiIndex,
      adapter,
      model: this.ctx.config.model,
      maxCandidates: 20,
    });
  }

  private async runDetectorsIfStale(): Promise<void> {
    const cache = this.ctx.wikiIndex.analysisCache();
    if (!cache.isStale('suggestions', DAILY_MS)) return;
    try {
      console.log('[analysis] running detectors…');
      const result = await runAnalysis({ store: this.ctx.store, wikiIndex: this.ctx.wikiIndex });
      console.log(`[analysis] detectors done — ${result.communities.length} communities, ` +
        `${result.godNodes.length} god-nodes, ${result.bridgeNodes.length} bridges, ` +
        `${result.orphanClusters.length} orphan clusters`);
    } catch (e) {
      console.error('[analysis] detectors failed:', (e as Error).message);
    }
  }

  private async runProbeIfDue(): Promise<void> {
    try {
      const adapter = this.ctx.getAdapter();
      const result = await runContradictionProbe({
        store: this.ctx.store, wikiIndex: this.ctx.wikiIndex,
        adapter, model: this.ctx.config.model,
        maxCandidates: 20,
      });
      console.log(`[analysis] contradiction probe — ${result.judged} judged, ${result.cached} cached`);
    } catch (e) {
      console.error('[analysis] probe failed:', (e as Error).message);
    }
  }
}
