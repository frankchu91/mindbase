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

  it('32GB machine defaults to qwen3:14b with the MoE as best tier', () => {
    const recs = recommendModels(mac(32));
    expect(recs[0]!.model).toBe('qwen3:14b');
    expect(recs.find((r) => r.tier === 'best')!.model).toBe('qwen3:30b-a3b');
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
