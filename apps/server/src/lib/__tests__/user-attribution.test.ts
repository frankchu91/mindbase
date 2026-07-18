import { describe, it, expect } from 'vitest';
import { resolveUser } from '../user-attribution.js';

describe('resolveUser', () => {
  it('returns header value if provided', () => {
    const req = { headers: { 'x-mindbase-user': 'alice' } };
    expect(resolveUser(req)).toBe('alice');
  });
  it('falls back to os.userInfo when header absent', () => {
    const req = { headers: {} };
    const u = resolveUser(req);
    expect(typeof u).toBe('string');
    expect(u.length).toBeGreaterThan(0);
  });
  it('ignores empty header', () => {
    const req = { headers: { 'x-mindbase-user': '' } };
    const u = resolveUser(req);
    expect(u).not.toBe('');
  });
});
