import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderBriefHtml, renderBriefText, persistBrief, readBrief, listBriefs } from './brief';
import type { BriefRecord } from './brief';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mb-brief-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const sampleBrief: BriefRecord = {
  date: '2026-05-09',
  generated_at: '2026-05-09T09:00:00.000Z',
  summary: 'You captured notes about topic A [1] and also explored topic B [2].',
  sections: [
    { heading: 'AI Research', content: 'Research notes on AI [1].' },
  ],
  citations: [
    { n: 1, slug: 'topic-a', title: 'Topic A', path: 'wiki/notes/topic-a.md', one_liner: 'Notes on A' },
    { n: 2, slug: 'topic-b', title: 'Topic B', path: 'wiki/notes/topic-b.md', one_liner: 'Notes on B' },
  ],
  status: 'preview-only',
};

describe('renderBriefHtml', () => {
  const publicUrl = 'http://localhost:4321';

  it('renders valid HTML with citation links', () => {
    const html = renderBriefHtml(sampleBrief, publicUrl);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<body');
    expect(html).toContain('MindBase Brief');
  });

  it('renders [1] as an anchor tag linking to topic-a', () => {
    const html = renderBriefHtml(sampleBrief, publicUrl);
    expect(html).toContain(`href="http://localhost:4321/article/topic-a"`);
    expect(html).toContain('[1]</a>');
  });

  it('renders [2] as an anchor tag linking to topic-b', () => {
    const html = renderBriefHtml(sampleBrief, publicUrl);
    expect(html).toContain(`href="http://localhost:4321/article/topic-b"`);
    expect(html).toContain('[2]</a>');
  });

  it('includes section headings', () => {
    const html = renderBriefHtml(sampleBrief, publicUrl);
    expect(html).toContain('AI Research');
  });

  it('includes sources list', () => {
    const html = renderBriefHtml(sampleBrief, publicUrl);
    expect(html).toContain('Topic A');
    expect(html).toContain('Topic B');
  });

  it('renders on_this_day block when present', () => {
    const withOTD: BriefRecord = {
      ...sampleBrief,
      on_this_day: { heading: 'On This Day', content: 'You wrote about topic A [1] one year ago.' },
    };
    const html = renderBriefHtml(withOTD, publicUrl);
    expect(html).toContain('On This Day');
    expect(html).toContain('one year ago');
  });

  it('renders inbox_pending nudge when present', () => {
    const withInbox: BriefRecord = { ...sampleBrief, inbox_pending: 3 };
    const html = renderBriefHtml(withInbox, publicUrl);
    expect(html).toContain('3 unprocessed captures');
  });

  it('escapes HTML in title to avoid XSS', () => {
    const withXSS: BriefRecord = {
      ...sampleBrief,
      citations: [
        { n: 1, slug: 'xss-test', title: '<script>alert(1)</script>', path: 'wiki/notes/xss-test.md', one_liner: '' },
      ],
    };
    const html = renderBriefHtml(withXSS, publicUrl);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderBriefText', () => {
  const publicUrl = 'http://localhost:4321';

  it('produces plain text with reference list at bottom', () => {
    const text = renderBriefText(sampleBrief, publicUrl);
    expect(text).toContain('MindBase Morning Brief');
    expect(text).toContain('2026-05-09');
    expect(text).toContain('[1]: http://localhost:4321/article/topic-a');
    expect(text).toContain('[2]: http://localhost:4321/article/topic-b');
  });

  it('includes summary', () => {
    const text = renderBriefText(sampleBrief, publicUrl);
    expect(text).toContain('captured notes about topic A');
  });

  it('includes section headings with ## prefix', () => {
    const text = renderBriefText(sampleBrief, publicUrl);
    expect(text).toContain('## AI Research');
  });
});

describe('persistBrief / readBrief round-trip', () => {
  it('writes and reads back correctly', async () => {
    await persistBrief(dir, sampleBrief);
    const loaded = await readBrief(dir, sampleBrief.date);
    expect(loaded).not.toBeNull();
    expect(loaded!.date).toBe('2026-05-09');
    expect(loaded!.citations).toHaveLength(2);
    expect(loaded!.summary).toBe(sampleBrief.summary);
  });

  it('returns null for non-existent date', async () => {
    const result = await readBrief(dir, '2000-01-01');
    expect(result).toBeNull();
  });

  it('listBriefs returns all stored briefs sorted newest-first', async () => {
    const brief1: BriefRecord = { ...sampleBrief, date: '2026-05-08' };
    const brief2: BriefRecord = { ...sampleBrief, date: '2026-05-09' };
    const brief3: BriefRecord = { ...sampleBrief, date: '2026-05-07' };
    await persistBrief(dir, brief1);
    await persistBrief(dir, brief2);
    await persistBrief(dir, brief3);

    const list = await listBriefs(dir);
    expect(list).toHaveLength(3);
    expect(list[0]!.date).toBe('2026-05-09');
    expect(list[1]!.date).toBe('2026-05-08');
    expect(list[2]!.date).toBe('2026-05-07');
  });

  it('listBriefs returns empty array when no briefs exist', async () => {
    const list = await listBriefs(dir);
    expect(list).toHaveLength(0);
  });

  it('overwrites existing brief on re-persist', async () => {
    await persistBrief(dir, sampleBrief);
    const updated: BriefRecord = { ...sampleBrief, status: 'sent', message_id: '<abc123>' };
    await persistBrief(dir, updated);
    const loaded = await readBrief(dir, sampleBrief.date);
    expect(loaded!.status).toBe('sent');
    expect(loaded!.message_id).toBe('<abc123>');
  });
});
