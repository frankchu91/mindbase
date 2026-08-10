// apps/server/src/lib/model-recommend.ts
//
// Pure recommendation logic: which free local models fit this machine.
// Ordering: recommended default first, then alternatives. The pull route's
// allowlist is derived from this list — keep every runnable tag here.
import type { SystemProfile } from './system-info';

export interface ModelRec {
  model: string;
  downloadGB: number;
  tier: 'minimal' | 'balanced' | 'best';
  reason: string;
}

export function recommendModels(p: SystemProfile): ModelRec[] {
  const slower = p.appleSilicon ? '' : ' Runs on CPU here, so expect slower responses.';
  if (p.totalMemGB < 12) {
    return [
      { model: 'llama3.2:3b', downloadGB: 2, tier: 'balanced', reason: `Fits comfortably in ${p.totalMemGB}GB RAM. Good for capture and summaries.${slower}` },
    ];
  }
  if (p.totalMemGB < 24) {
    return [
      { model: 'qwen3:8b', downloadGB: 5, tier: 'balanced', reason: `The sweet spot for ${p.totalMemGB}GB RAM — solid summaries and reliable tool calls.${slower}` },
      { model: 'qwen3:14b', downloadGB: 9, tier: 'best', reason: `Noticeably better synthesis; leaves less headroom for other apps.${slower}` },
      { model: 'llama3.2:3b', downloadGB: 2, tier: 'minimal', reason: 'Smallest and fastest; basic capture only.' },
    ];
  }
  const out: ModelRec[] = [
    { model: 'qwen3:14b', downloadGB: 9, tier: 'balanced', reason: `Best all-rounder for ${p.totalMemGB}GB RAM — strong summaries, stable structured output.${slower}` },
    { model: 'qwen3:30b-a3b', downloadGB: 19, tier: 'best', reason: `Mixture-of-experts: near-30B quality at 8B-like speed. Uses ~20GB while running.${slower}` },
    { model: 'qwen3:8b', downloadGB: 5, tier: 'minimal', reason: 'Lighter and faster; fine for capture and search.' },
  ];
  // Meta's Muse Glimmer (30B dense, Apache 2.0, tuned for agentic/structured
  // work) ships MLX-only for now — offer it exclusively on Apple Silicon
  // with the RAM to hold ~20GB while running.
  if (p.appleSilicon && p.totalMemGB >= 32) {
    out.splice(1, 0, {
      model: 'muse-glimmer:30b-mlx',
      downloadGB: 21,
      tier: 'best',
      reason: `Meta's open-weight 30B, tuned for agentic + structured output — a strong fit for wiki synthesis on ${p.totalMemGB}GB Apple Silicon. Uses ~20GB while running.`,
    });
    // Only one 'best' pick per list: demote the MoE alternative.
    const moe = out.find((r) => r.model === 'qwen3:30b-a3b');
    if (moe) moe.tier = 'balanced';
  }
  return out;
}

/** Every tag the pull route may fetch — the union across all hardware tiers. */
export function allowedModels(): Set<string> {
  const tags = new Set<string>();
  for (const mem of [8, 16, 32]) {
    for (const r of recommendModels({ platform: 'darwin', arch: 'arm64', totalMemGB: mem, cpuModel: '', appleSilicon: true })) {
      tags.add(r.model);
    }
  }
  return tags;
}
