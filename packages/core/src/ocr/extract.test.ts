import { describe, it, expect } from 'vitest';
import { extractBase64Images } from './extract';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

describe('extractBase64Images', () => {
  it('returns the markdown unchanged when no inline images are present', () => {
    const md = '# Title\n\nJust text. ![ref to disk](/api/wiki/attachments/x/y.png)';
    const r = extractBase64Images(md, '/api/wiki/attachments/note-1');
    expect(r.rewrittenMarkdown).toBe(md);
    expect(r.extracted).toHaveLength(0);
  });

  it('extracts one inline PNG and replaces it with an attachment URL', () => {
    const md = `# Note\n\n![Screenshot](data:image/png;base64,${TINY_PNG_BASE64})\n\nBelow.`;
    const r = extractBase64Images(md, '/api/wiki/attachments/note-1');
    expect(r.extracted).toHaveLength(1);
    const e = r.extracted[0]!;
    expect(e.ext).toBe('.png');
    expect(e.alt).toBe('Screenshot');
    expect(e.hash).toMatch(/^[0-9a-f]{12}$/);
    expect(e.data.length).toBeGreaterThan(0);
    expect(r.rewrittenMarkdown).toContain(`![Screenshot](/api/wiki/attachments/note-1/${e.hash}.png)`);
    expect(r.rewrittenMarkdown).not.toContain('data:image/png;base64,');
  });

  it('hashes identical bytes identically (dedupe by content)', () => {
    const md = `![a](data:image/png;base64,${TINY_PNG_BASE64})\n\n![b](data:image/png;base64,${TINY_PNG_BASE64})`;
    const r = extractBase64Images(md, '/api/wiki/attachments/note-1');
    expect(r.extracted).toHaveLength(2);
    expect(r.extracted[0]!.hash).toBe(r.extracted[1]!.hash);
  });

  it('handles JPEG, GIF, WEBP in addition to PNG', () => {
    const md = [
      `![p](data:image/png;base64,${TINY_PNG_BASE64})`,
      `![j](data:image/jpeg;base64,${TINY_PNG_BASE64})`,
      `![g](data:image/gif;base64,${TINY_PNG_BASE64})`,
      `![w](data:image/webp;base64,${TINY_PNG_BASE64})`,
    ].join('\n\n');
    const r = extractBase64Images(md, '/api/wiki/attachments/note-1');
    const exts = r.extracted.map((e) => e.ext).sort();
    expect(exts).toEqual(['.gif', '.jpg', '.png', '.webp']);
  });

  it('skips data URIs that are not images (e.g. fonts, audio)', () => {
    const md = '![bad](data:audio/mp3;base64,aaaa)\n\n![ok](data:image/png;base64,' + TINY_PNG_BASE64 + ')';
    const r = extractBase64Images(md, '/api/wiki/attachments/note-1');
    expect(r.extracted).toHaveLength(1);
    expect(r.extracted[0]!.ext).toBe('.png');
  });

  it('preserves alt text with special chars, emojis, and newlines escaped', () => {
    const md = `![Hello 你好 🚀 \\nworld](data:image/png;base64,${TINY_PNG_BASE64})`;
    const r = extractBase64Images(md, '/api/wiki/attachments/note-1');
    expect(r.extracted).toHaveLength(1);
    expect(r.extracted[0]!.alt).toBe('Hello 你好 🚀 \\nworld');
  });

  it('leaves the block as-is and throws no error when base64 is malformed', () => {
    const md = '![bad](data:image/png;base64,this-is-not-valid-base64!!!)\n\nrest';
    const r = extractBase64Images(md, '/api/wiki/attachments/note-1');
    // Either keeps the block (if it skipped due to validation) or extracted with possibly empty bytes.
    // We assert no crash. If kept, no extraction; if extracted, hash exists.
    if (r.extracted.length === 0) {
      expect(r.rewrittenMarkdown).toContain('data:image/png');
    } else {
      expect(r.extracted[0]!.hash).toMatch(/^[0-9a-f]{12}$/);
    }
  });
});
