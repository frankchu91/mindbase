import { describe, it, expect } from 'vitest';
import { EDGE_TYPES, isEdgeType, type EdgeType } from './edge-type';

describe('edge-type', () => {
  it('exposes all 8 canonical types in stable order', () => {
    expect(EDGE_TYPES).toEqual([
      'mentions',
      'elaborates',
      'cites',
      'contradicts',
      'supersedes',
      'is_a',
      'part_of',
      'example_of',
    ]);
  });

  it('isEdgeType returns true only for canonical types', () => {
    expect(isEdgeType('cites')).toBe(true);
    expect(isEdgeType('mentions')).toBe(true);
    expect(isEdgeType('random')).toBe(false);
    expect(isEdgeType('')).toBe(false);
    expect(isEdgeType(null as unknown as string)).toBe(false);
  });

  it('EdgeType is assignable from canonical strings', () => {
    const x: EdgeType = 'cites';
    expect(x).toBe('cites');
  });
});
