import { describe, it, expect } from 'vitest';
import { recommendModels, allowedModels } from './model-recommend';
import type { SystemProfile } from './system-info';

function mac(totalMemGB: number): SystemProfile {
  return { platform: 'darwin', arch: 'arm64', totalMemGB, cpuModel: 'Apple M2 Pro', appleSilicon: true };
}

describe('recommendModels', () => {
  it('8GB machine gets the 3B model only', () => {
    const recs = recommendModels(mac(8));
    expect(recs[0]!.model).toBe('llama3.2:3b');
    expect(recs).toHaveLength(1);
  });

  it('16GB machine defaults to qwen3:8b with a 14b upgrade', () => {
    const recs = recommendModels(mac(16));
    expect(recs[0]!.model).toBe('qwen3:8b');
    expect(recs.map((r) => r.tier)).toContain('best');
  });

  it('32GB Apple Silicon defaults to qwen3:14b with Muse Glimmer as best tier', () => {
    const recs = recommendModels(mac(32));
    expect(recs[0]!.model).toBe('qwen3:14b');
    expect(recs.find((r) => r.tier === 'best')!.model).toBe('muse-glimmer:30b-mlx');
    // MoE stays available but no longer claims the best slot
    expect(recs.find((r) => r.model === 'qwen3:30b-a3b')!.tier).toBe('balanced');
  });

  it('Glimmer is MLX-only: never offered on non-Apple-Silicon or <32GB', () => {
    const linux = recommendModels({ platform: 'linux', arch: 'x64', totalMemGB: 64, cpuModel: 'i9', appleSilicon: false });
    expect(linux.some((r) => r.model.startsWith('muse-glimmer'))).toBe(false);
    expect(recommendModels(mac(24)).some((r) => r.model.startsWith('muse-glimmer'))).toBe(false);
  });

  it('non-Apple-Silicon reasons mention slower CPU inference', () => {
    const recs = recommendModels({ platform: 'linux', arch: 'x64', totalMemGB: 32, cpuModel: 'i7', appleSilicon: false });
    expect(recs[0]!.reason).toMatch(/slower/i);
  });

  it('allowlist is the union of all tiers', () => {
    const tags = allowedModels();
    for (const t of ['llama3.2:3b', 'qwen3:8b', 'qwen3:14b', 'qwen3:30b-a3b']) {
      expect(tags.has(t)).toBe(true);
    }
  });
});
