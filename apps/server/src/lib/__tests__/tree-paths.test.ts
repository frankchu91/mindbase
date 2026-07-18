import { describe, it, expect } from 'vitest';
import { resolveTreePath, isSingleFileCategory, isPathSafe, TREE_CATEGORIES } from '../tree-paths.js';

describe('resolveTreePath', () => {
  it('resolves single-file categories', () => {
    expect(resolveTreePath('readme', '', 'anyuser')).toBe('README.md');
    expect(resolveTreePath('context', '', 'anyuser')).toBe('context.md');
    expect(resolveTreePath('soul', '', 'anyuser')).toBe('soul.md');
  });

  it('resolves contributors under user directory', () => {
    expect(resolveTreePath('contributors', '2026-06-09.md', 'haobing')).toBe('sources/contributors/haobing/2026-06-09.md');
  });

  it('resolves research files flat', () => {
    expect(resolveTreePath('research', 'rag-notes.md', 'alice')).toBe('sources/research/rag-notes.md');
  });

  it('resolves logs files flat', () => {
    expect(resolveTreePath('logs', '2026-06-09.md', 'x')).toBe('logs/2026-06-09.md');
  });

  it('resolves artifacts arbitrarily nested', () => {
    expect(resolveTreePath('artifacts', 'briefs/2026-06-09.md', 'x')).toBe('artifacts/briefs/2026-06-09.md');
  });

  it('resolves raw grouped by date', () => {
    expect(resolveTreePath('raw', '2026-06-09/abc.md', 'x')).toBe('sources/raw/2026-06-09/abc.md');
  });
});

describe('isSingleFileCategory', () => {
  it('is true for readme/context/soul', () => {
    expect(isSingleFileCategory('readme')).toBe(true);
    expect(isSingleFileCategory('context')).toBe(true);
    expect(isSingleFileCategory('soul')).toBe(true);
  });
  it('is false for others', () => {
    expect(isSingleFileCategory('contributors')).toBe(false);
    expect(isSingleFileCategory('research')).toBe(false);
    expect(isSingleFileCategory('artifacts')).toBe(false);
  });
});

describe('isPathSafe', () => {
  it('accepts normal relative paths', () => {
    expect(isPathSafe('2026-06-09.md')).toBe(true);
    expect(isPathSafe('sub/foo.md')).toBe(true);
  });
  it('rejects .. traversal', () => {
    expect(isPathSafe('../foo.md')).toBe(false);
    expect(isPathSafe('a/../../b')).toBe(false);
  });
  it('rejects absolute paths', () => {
    expect(isPathSafe('/etc/passwd')).toBe(false);
  });
});

describe('TREE_CATEGORIES', () => {
  it('lists all 8 categories', () => {
    expect(TREE_CATEGORIES).toHaveLength(8);
    expect(new Set(TREE_CATEGORIES)).toEqual(new Set([
      'readme', 'context', 'soul', 'contributors', 'research', 'raw', 'logs', 'artifacts',
    ]));
  });
});
