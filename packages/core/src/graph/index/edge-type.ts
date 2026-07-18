/**
 * The 8 canonical edge types Phase 2 supports. Ordered so the default
 * `mentions` appears first; downstream UIs can iterate in this order
 * for consistent rendering.
 */
export const EDGE_TYPES = [
  'mentions',
  'elaborates',
  'cites',
  'contradicts',
  'supersedes',
  'is_a',
  'part_of',
  'example_of',
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

const EDGE_TYPE_SET: ReadonlySet<string> = new Set<string>(EDGE_TYPES);

export function isEdgeType(v: unknown): v is EdgeType {
  return typeof v === 'string' && EDGE_TYPE_SET.has(v);
}
