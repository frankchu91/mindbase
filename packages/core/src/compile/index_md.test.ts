import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { readIndex, parseIndex } from './index_md';

describe('INDEX.md helpers', () => {
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
  });

  it('readIndex returns empty placeholder when file does not exist', async () => {
    const body = await readIndex(store);
    expect(body).toContain('MindBase Wiki Index');
  });

  it('readIndex returns existing file content', async () => {
    await store.writeText(
      'wiki/INDEX.md',
      '# MindBase Wiki Index\n\n- [RAG](wiki/concepts/rag.md) — retrieval-augmented generation\n',
    );
    const body = await readIndex(store);
    expect(body).toContain('RAG');
  });

  it('parseIndex returns entries from a bullet list', () => {
    const text = `# MindBase Wiki Index

- [RAG](wiki/concepts/rag.md) — retrieval-augmented generation
- [MCP](wiki/concepts/mcp.md) — Model Context Protocol
`;
    const entries = parseIndex(text);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      title: 'RAG',
      path: 'wiki/concepts/rag.md',
      one_liner: 'retrieval-augmented generation',
    });
  });

  it('parseIndex tolerates extra whitespace', () => {
    const text = '- [A](a.md)  —  foo\n-   [B](b.md) — bar\n';
    const entries = parseIndex(text);
    expect(entries).toHaveLength(2);
  });

  it('parseIndex ignores non-bullet lines', () => {
    const text = '# Header\nsome prose\n- [A](a.md) — hi\n';
    const entries = parseIndex(text);
    expect(entries).toHaveLength(1);
  });
});
