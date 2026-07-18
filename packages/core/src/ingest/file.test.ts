import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { ingestFile } from './file';
import { ingestPaste } from './paste';
import type { RawMetaJson } from '../types';

describe('ingestPaste', () => {
  let store: MemoryStore;
  beforeEach(async () => {
    store = new MemoryStore();
  });

  it('writes raw md and meta.json', async () => {
    const raw = await ingestPaste(store, { text: 'Hello world.\nMore text.', title: 'Greeting' });
    expect(raw.id).toMatch(/^[a-z0-9]{6}$/);
    const body = await store.readText(raw.path + '.md');
    expect(body).toContain('Hello world');
    const meta = await store.readJSON<RawMetaJson>(raw.path + '.meta.json');
    expect(meta.kind).toBe('paste');
    expect(meta.title).toBe('Greeting');
  });

  it('infers title from first non-empty line when missing', async () => {
    const raw = await ingestPaste(store, { text: '\nActual title\nmore' });
    expect(raw.title).toBe('Actual title');
  });

  it('persists capture provenance fields on RawMetaJson and RawDoc', async () => {
    const captured_at = '2026-05-09T12:34:56.000Z';
    const raw = await ingestPaste(store, {
      text: 'A snippet from my phone',
      title: 'Captured snippet',
      source_url: 'https://example.com/article',
      captured_via: 'ios',
      captured_device: 'phone-ulid-abc',
      captured_at,
      kind: 'capture',
      tags: ['mobile', 'reading'],
    });
    expect(raw.captured_via).toBe('ios');
    expect(raw.captured_device).toBe('phone-ulid-abc');
    expect(raw.captured_at).toBe(captured_at);
    expect(raw.tags).toEqual(['mobile', 'reading']);
    const meta = await store.readJSON<RawMetaJson>(raw.path + '.meta.json');
    expect(meta.kind).toBe('capture');
    expect(meta.captured_via).toBe('ios');
    expect(meta.captured_device).toBe('phone-ulid-abc');
    expect(meta.captured_at).toBe(captured_at);
    expect(meta.source_url).toBe('https://example.com/article');
    expect(meta.tags).toEqual(['mobile', 'reading']);
  });

  it('defaults kind to "paste" and captured_at to now when omitted', async () => {
    const before = Date.now();
    const raw = await ingestPaste(store, { text: 'hello' });
    const after = Date.now();
    const meta = await store.readJSON<RawMetaJson>(raw.path + '.meta.json');
    expect(meta.kind).toBe('paste');
    expect(meta.captured_via).toBeUndefined();
    expect(meta.captured_device).toBeUndefined();
    const ts = Date.parse(meta.captured_at);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });
});

describe('ingestFile', () => {
  let store: MemoryStore;
  beforeEach(async () => {
    store = new MemoryStore();
  });

  it('ingests a text/plain file', async () => {
    const file = new File(['hello from txt'], 'note.txt', { type: 'text/plain' });
    const raw = await ingestFile(store, file);
    expect(raw.title).toBe('note');
    const meta = await store.readJSON<RawMetaJson>(raw.path + '.meta.json');
    expect(meta.kind).toBe('upload-txt');
    expect(await store.readText(raw.path + '.md')).toBe('hello from txt');
  });

  it('ingests a markdown file', async () => {
    const file = new File(['# Title\nbody'], 'doc.md', { type: 'text/markdown' });
    const raw = await ingestFile(store, file);
    const meta = await store.readJSON<RawMetaJson>(raw.path + '.meta.json');
    expect(meta.kind).toBe('upload-md');
    expect(await store.readText(raw.path + '.md')).toContain('# Title');
  });

  it('ingests a PDF using the injected extractor', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const file = new File([bytes], 'paper.pdf', { type: 'application/pdf' });
    const raw = await ingestFile(store, file, {
      pdfExtract: async () => 'Extracted PDF text',
    });
    const meta = await store.readJSON<RawMetaJson>(raw.path + '.meta.json');
    expect(meta.kind).toBe('upload-pdf');
    expect(await store.readText(raw.path + '.md')).toBe('Extracted PDF text');
  });

  it('gracefully handles PDF without an extractor injected', async () => {
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'x.pdf', { type: 'application/pdf' });
    const raw = await ingestFile(store, file);
    expect(raw.content).toContain('PDF text extraction not available');
  });

  it('rejects unknown file types', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'x.bin', { type: 'application/octet-stream' });
    await expect(ingestFile(store, file)).rejects.toThrow(/unsupported/);
  });
});
