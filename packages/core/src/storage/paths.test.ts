import { describe, it, expect } from 'vitest';
import {
  rawPath,
  rawMetaPath,
  conceptPath,
  conceptMetaPath,
  sourcesPath,
  indexPath,
  slugify,
  todayDir,
} from './paths';

describe('paths', () => {
  it('rawPath joins date and id', () => {
    expect(rawPath('2026-04-08', 'a1b2c3')).toBe('raw/2026-04-08/a1b2c3.md');
  });

  it('rawMetaPath pairs with rawPath', () => {
    expect(rawMetaPath('2026-04-08', 'a1b2c3')).toBe('raw/2026-04-08/a1b2c3.meta.json');
  });

  it('conceptPath uses slug (LLM-owned concepts/ layer per the 3-layer contract)', () => {
    expect(conceptPath('rag')).toBe('wiki/concepts/rag.md');
  });

  it('conceptMetaPath pairs with conceptPath', () => {
    expect(conceptMetaPath('rag')).toBe('wiki/concepts/rag.meta.json');
  });

  it('sourcesPath uses raw id', () => {
    expect(sourcesPath('a1b2c3')).toBe('wiki/sources/a1b2c3.md');
  });

  it('indexPath is constant', () => {
    expect(indexPath()).toBe('wiki/INDEX.md');
  });

  it('slugify lowercases and replaces spaces/symbols', () => {
    expect(slugify('Retrieval-Augmented Generation')).toBe('retrieval-augmented-generation');
    expect(slugify("  Hello World!  ")).toBe('hello-world');
    expect(slugify('MCP & Tool Use')).toBe('mcp-tool-use');
  });

  it('slugify collapses multiple dashes', () => {
    expect(slugify('a -- b')).toBe('a-b');
  });

  it('todayDir returns YYYY-MM-DD', () => {
    const s = todayDir(new Date('2026-04-08T12:34:56Z'));
    expect(s).toBe('2026-04-08');
  });
});

import { newShortId } from './ids';

describe('ids', () => {
  it('newShortId returns a 6-char lowercase alphanumeric string', () => {
    const id = newShortId();
    expect(id).toMatch(/^[a-z0-9]{6}$/);
  });

  it('newShortId returns distinct ids across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newShortId()));
    expect(ids.size).toBe(100);
  });
});
