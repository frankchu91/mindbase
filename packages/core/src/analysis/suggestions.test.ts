import { describe, it, expect } from 'vitest';
import { generateSuggestions, type SuggestionInput } from './suggestions';

const baseInput: SuggestionInput = {
  godNodes: [],
  bridgeNodes: [],
  orphanClusters: [],
  contradictions: [],
  ambiguousLinks: [],
};

describe('generateSuggestions', () => {
  it('returns empty when nothing notable', () => {
    expect(generateSuggestions(baseInput)).toEqual([]);
  });

  it('emits a suggestion for each orphan cluster', () => {
    const out = generateSuggestions({
      ...baseInput,
      orphanClusters: [{ slugs: ['x', 'y'], size: 2 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('orphan_cluster');
    expect(out[0]?.message).toContain('x');
    expect(out[0]?.actionable.slugs).toEqual(['x', 'y']);
  });

  it('emits a suggestion for each confirmed contradiction', () => {
    const out = generateSuggestions({
      ...baseInput,
      contradictions: [{ slugA: 'a', slugB: 'b', reason: 'A says X but B says not-X' }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('contradiction');
    expect(out[0]?.message).toContain('a');
    expect(out[0]?.message).toContain('b');
  });

  it('emits a god-node-disambiguation suggestion when god-node has many INFERRED edges', () => {
    const out = generateSuggestions({
      ...baseInput,
      godNodes: [{ slug: 'hub', title: 'Hub', inboundCount: 50, outboundCount: 10 }],
      ambiguousLinks: [
        { source: 'a', target: 'hub', edgeType: 'mentions', confidence: 'inferred' },
        { source: 'b', target: 'hub', edgeType: 'mentions', confidence: 'inferred' },
        { source: 'c', target: 'hub', edgeType: 'mentions', confidence: 'inferred' },
        { source: 'd', target: 'hub', edgeType: 'mentions', confidence: 'inferred' },
      ],
    });
    const godNoteSuggestion = out.find((s) => s.kind === 'god_node_disambiguation');
    expect(godNoteSuggestion).toBeDefined();
    expect(godNoteSuggestion?.message).toContain('Hub');
  });

  it('emits a bridge-elaboration suggestion for bridges spanning 3+ communities', () => {
    const out = generateSuggestions({
      ...baseInput,
      bridgeNodes: [{ slug: 'wide_bridge', title: 'Wide', communityCount: 4, communities: [0, 1, 2, 3], neighborCount: 12 }],
    });
    const bridgeSuggestion = out.find((s) => s.kind === 'bridge_elaboration');
    expect(bridgeSuggestion).toBeDefined();
    expect(bridgeSuggestion?.message).toContain('Wide');
  });

  it('caps total suggestions at 5 by default', () => {
    const out = generateSuggestions({
      ...baseInput,
      orphanClusters: [
        { slugs: ['a'], size: 1 },
        { slugs: ['b'], size: 1 },
        { slugs: ['c'], size: 1 },
        { slugs: ['d'], size: 1 },
        { slugs: ['e'], size: 1 },
        { slugs: ['f'], size: 1 },
        { slugs: ['g'], size: 1 },
      ],
    });
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it('respects custom max', () => {
    const out = generateSuggestions({
      ...baseInput,
      orphanClusters: [{ slugs: ['a'], size: 1 }, { slugs: ['b'], size: 1 }, { slugs: ['c'], size: 1 }],
    }, { max: 2 });
    expect(out).toHaveLength(2);
  });
});
