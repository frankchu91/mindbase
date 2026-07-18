import { describe, it, expect } from 'vitest';
import { parseOutline } from './outline';

describe('parseOutline', () => {
  it('returns flat list for non-nested headings', () => {
    const md = `# A\n\nbody\n\n# B\n\nbody`;
    const out = parseOutline(md);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ level: 1, text: 'A', anchor: 'a' });
    expect(out[1]).toMatchObject({ level: 1, text: 'B', anchor: 'b' });
    expect(out[0]!.children).toEqual([]);
  });

  it('nests subheadings under parents', () => {
    const md = `# Top\n## Sub A\n## Sub B\n### Deep`;
    const out = parseOutline(md);
    expect(out).toHaveLength(1);
    expect(out[0]!.children).toHaveLength(2);
    expect(out[0]!.children[1]!.children).toHaveLength(1);
    expect(out[0]!.children[1]!.children[0]!.text).toBe('Deep');
  });

  it('ignores headings inside fenced code blocks', () => {
    const md = `# Real\n\n\`\`\`\n# Not a heading\n## Also not\n\`\`\`\n\n## Also real`;
    const out = parseOutline(md);
    expect(out).toHaveLength(1);
    expect(out[0]!.children).toHaveLength(1);
    expect(out[0]!.children[0]!.text).toBe('Also real');
  });

  it('returns [] for empty input', () => {
    expect(parseOutline('')).toEqual([]);
    expect(parseOutline('paragraph only')).toEqual([]);
  });

  it('slugifies anchors (lowercase, non-alnum → dash)', () => {
    const md = `# Hello World!\n## C++ tricks\n### a   b`;
    const out = parseOutline(md);
    expect(out[0]!.anchor).toBe('hello-world');
    expect(out[0]!.children[0]!.anchor).toBe('c-tricks');
    expect(out[0]!.children[0]!.children[0]!.anchor).toBe('a-b');
  });
});
