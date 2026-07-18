import { describe, it, expect } from 'vitest';
import { generateOrder, compareOrder } from './order';

describe('tree/order', () => {
  it('generates a key when both prev and next are absent (empty list)', () => {
    const k = generateOrder();
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(0);
  });

  it('generates a key strictly greater than prev when next is absent (append)', () => {
    const k = generateOrder('a0');
    expect(compareOrder(k, 'a0')).toBeGreaterThan(0);
  });

  it('generates a key strictly less than next when prev is absent (prepend)', () => {
    const k = generateOrder(undefined, 'a0');
    expect(compareOrder(k, 'a0')).toBeLessThan(0);
  });

  it('generates a key between prev and next when both are present', () => {
    const k = generateOrder('a0', 'a1');
    expect(compareOrder(k, 'a0')).toBeGreaterThan(0);
    expect(compareOrder(k, 'a1')).toBeLessThan(0);
  });

  it('compareOrder sorts lexicographically', () => {
    expect(compareOrder('a', 'b')).toBeLessThan(0);
    expect(compareOrder('b', 'a')).toBeGreaterThan(0);
    expect(compareOrder('a', 'a')).toBe(0);
  });

  it('repeated prepends produce strictly decreasing keys', () => {
    let prev: string | undefined = undefined;
    let last: string | undefined = undefined;
    for (let i = 0; i < 50; i++) {
      const k = generateOrder(undefined, prev);
      if (last !== undefined) {
        expect(compareOrder(k, last)).toBeLessThan(0);
      }
      last = k;
      prev = k;
    }
  });
});
