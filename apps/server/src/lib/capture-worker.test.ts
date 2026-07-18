import { describe, it, expect } from 'vitest';
import { deriveTitle } from './capture-worker';

describe('deriveTitle', () => {
  it('takes the first non-empty line, trimmed and capped at 80 chars', () => {
    expect(deriveTitle('  hello world  \nrest')).toBe('hello world');
  });

  it('skips leading blank lines', () => {
    expect(deriveTitle('\n\n  actual title\nbody')).toBe('actual title');
  });

  it('caps at 80 chars', () => {
    const long = 'A'.repeat(200);
    expect(deriveTitle(long)).toHaveLength(80);
  });

  it('falls back to "Untitled capture" for empty input', () => {
    expect(deriveTitle('')).toBe('Untitled capture');
    expect(deriveTitle('   \n   \n   ')).toBe('Untitled capture');
  });
});
