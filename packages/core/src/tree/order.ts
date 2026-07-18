import { generateKeyBetween } from 'fractional-indexing';

/**
 * Generate a fractional-index key between two existing siblings. Passing
 * `undefined` for either end means "boundary" (prepend / append).
 *
 * - generateOrder()           → first key for an empty list
 * - generateOrder('a0')       → key after 'a0' (append)
 * - generateOrder(undefined, 'a0') → key before 'a0' (prepend)
 * - generateOrder('a0', 'a1') → key between 'a0' and 'a1'
 */
export function generateOrder(prev?: string, next?: string): string {
  return generateKeyBetween(prev ?? null, next ?? null);
}

/** Lexicographic compare. `< 0` means a sorts before b. */
export function compareOrder(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
