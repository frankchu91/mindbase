import { describe, it, expect } from 'vitest';
import { extractWikilinks } from './extract-links';

describe('extractWikilinks', () => {
  it('finds plain wikilinks and slugifies the target', () => {
    const links = extractWikilinks('See [[RAG]] and [[Vector Search]].');
    expect(links).toEqual([
      { target: 'rag', confidence: 'extracted', contextSnippet: expect.any(String), section: null },
      { target: 'vector-search', confidence: 'extracted', contextSnippet: expect.any(String), section: null },
    ]);
  });

  it('respects the ^[inferred] marker on the same line', () => {
    const links = extractWikilinks('It builds on [[colbert]] ^[inferred].');
    expect(links[0]?.confidence).toBe('inferred');
  });

  it('respects the ^[ambiguous] marker on the same line', () => {
    const links = extractWikilinks('See [[transformer]] ^[ambiguous].');
    expect(links[0]?.confidence).toBe('ambiguous');
  });

  it('strips code blocks before scanning', () => {
    const links = extractWikilinks('\n```\n[[fake-link]]\n```\nReal [[real-link]] here.\n');
    expect(links.map((l) => l.target)).toEqual(['real-link']);
  });

  it('strips inline code before scanning', () => {
    const links = extractWikilinks('Use `[[fake]]` not [[real]].');
    expect(links.map((l) => l.target)).toEqual(['real']);
  });

  it('deduplicates same-target multiple-mention but keeps strongest confidence', () => {
    // Mention twice — once plain, once inferred. The inferred one wins.
    const links = extractWikilinks('Once [[rag]] then again [[rag]] ^[inferred].');
    expect(links).toHaveLength(1);
    expect(links[0]?.target).toBe('rag');
    expect(links[0]?.confidence).toBe('inferred');
  });

  it('handles the | alias syntax: [[slug|Display Text]]', () => {
    const links = extractWikilinks('Click [[rag|here]] to see RAG.');
    expect(links[0]?.target).toBe('rag');
  });

  it('returns empty for text without wikilinks', () => {
    expect(extractWikilinks('Plain prose. Nothing here.')).toEqual([]);
  });

  it('captures a ±120 char context window in contextSnippet', () => {
    const body = 'A'.repeat(200) + ' some words [[target]] more words ' + 'B'.repeat(200);
    const links = extractWikilinks(body);
    expect(links[0]?.contextSnippet?.length).toBeLessThanOrEqual(240 + '[[target]]'.length + 20);
    expect(links[0]?.contextSnippet).toContain('[[target]]');
  });
});

describe('extractWikilinks — section tracking', () => {
  it('tags a wikilink with the H2 section it appears under', () => {
    const body = `# RAG

Intro text [[llm]].

## Sources

- [[paper-abc]]
- See [[paper-def]] for details.

## See also

[[transformer]]
`;
    const links = extractWikilinks(body);
    const llm = links.find((l) => l.target === 'llm');
    const paperAbc = links.find((l) => l.target === 'paper-abc');
    const paperDef = links.find((l) => l.target === 'paper-def');
    const transformer = links.find((l) => l.target === 'transformer');
    expect(llm?.section).toBeNull();           // before any H2
    expect(paperAbc?.section).toBe('Sources');
    expect(paperDef?.section).toBe('Sources');
    expect(transformer?.section).toBe('See also');
  });

  it('uses the H3 section name when nested under an H2', () => {
    const body = `## Background

### Prior work

[[predecessor]]
`;
    const links = extractWikilinks(body);
    expect(links[0]?.section).toBe('Prior work');
  });

  it('strips trailing punctuation from section names', () => {
    const body = `## Sources:\n\n[[x]]`;
    expect(extractWikilinks(body)[0]?.section).toBe('Sources');
  });

  it('handles section heading inside a code block (must be ignored)', () => {
    const body = `## Real Section

[[a]]

\`\`\`
## Fake Section In Code
\`\`\`

[[b]]
`;
    const links = extractWikilinks(body);
    expect(links.find((l) => l.target === 'a')?.section).toBe('Real Section');
    expect(links.find((l) => l.target === 'b')?.section).toBe('Real Section');
  });
});
