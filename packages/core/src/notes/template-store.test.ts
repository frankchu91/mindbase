import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TemplateStore } from './template-store';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mb-tmpl-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('TemplateStore — CRUD', () => {
  it('list returns empty when directory missing', async () => {
    const store = new TemplateStore(dir);
    const list = await store.list();
    expect(list).toEqual([]);
  });

  it('set then get returns same content', async () => {
    const store = new TemplateStore(dir);
    await store.set('foo', '# Foo\n\nBody.');
    const content = await store.get('foo');
    expect(content).toBe('# Foo\n\nBody.');
  });

  it('list returns name/title/preview with built-in label override', async () => {
    const store = new TemplateStore(dir);
    await store.set('meeting', '# Meeting · {{title}} · {{date}}\n\n## Agenda\n');
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('meeting');
    // Built-in templates use a hardcoded human label, NOT the raw H1
    // (which contains template variables and makes a terrible menu label).
    expect(list[0]!.title).toBe('Meeting');
    expect(list[0]!.preview.length).toBeLessThanOrEqual(100);
    // The H1 line is stripped from the preview too — it's not useful.
    expect(list[0]!.preview).not.toContain('{{title}}');
  });

  it('list Title-Cases unknown template filenames', async () => {
    const store = new TemplateStore(dir);
    await store.set('book-review', '# {{title}}\n\nNotes:\n');
    await store.set('weekly_review', '# {{title}}\n\nReview:\n');
    const list = await store.list();
    const titles = Object.fromEntries(list.map((t) => [t.name, t.title]));
    expect(titles['book-review']).toBe('Book Review');
    expect(titles['weekly_review']).toBe('Weekly Review');
  });

  it('delete removes file; get returns null', async () => {
    const store = new TemplateStore(dir);
    await store.set('tmp', 'body');
    await store.delete('tmp');
    expect(await store.get('tmp')).toBeNull();
  });

  it('delete of non-existent name is a no-op', async () => {
    const store = new TemplateStore(dir);
    await expect(store.delete('nonexistent')).resolves.toBeUndefined();
  });

  it('rejects invalid template names', async () => {
    const store = new TemplateStore(dir);
    await expect(store.set('../etc/passwd', 'x')).rejects.toThrow(/invalid/i);
    await expect(store.set('a/b', 'x')).rejects.toThrow(/invalid/i);
    await expect(store.set('', 'x')).rejects.toThrow(/invalid/i);
  });
});

describe('TemplateStore — defaults', () => {
  it('ensureDefaults seeds 5 templates on first run', async () => {
    const store = new TemplateStore(dir);
    await store.ensureDefaults();
    const list = await store.list();
    const names = list.map((t) => t.name).sort();
    expect(names).toEqual(['daily', 'meeting', 'note', 'person', 'project']);
  });

  it('ensureDefaults does NOT overwrite existing templates', async () => {
    const store = new TemplateStore(dir);
    await store.set('daily', '# my custom daily');
    await store.ensureDefaults();
    const body = await store.get('daily');
    expect(body).toBe('# my custom daily');
  });

  it('daily default contains expected sections', async () => {
    const store = new TemplateStore(dir);
    await store.ensureDefaults();
    const body = await store.get('daily');
    expect(body).toContain('{{date_long}}');
    expect(body).toContain('{{yesterday_slug}}');
    expect(body).toContain('## What I did');
  });
});

describe('TemplateStore — apply variables', () => {
  it('substitutes simple placeholders', () => {
    const store = new TemplateStore(dir);
    const out = store.apply('Hello {{name}}, today is {{date}}.', { name: 'Frank', date: '2026-05-17' });
    expect(out).toBe('Hello Frank, today is 2026-05-17.');
  });

  it('repeats substitutions for multiple occurrences', () => {
    const store = new TemplateStore(dir);
    const out = store.apply('{{x}} and {{x}}', { x: 'A' });
    expect(out).toBe('A and A');
  });

  it('leaves unmatched placeholders intact', () => {
    const store = new TemplateStore(dir);
    const out = store.apply('Hi {{name}}, {{unknown}}', { name: 'F' });
    expect(out).toBe('Hi F, {{unknown}}');
  });

  it('escapes regex specials in variable values', () => {
    const store = new TemplateStore(dir);
    const out = store.apply('Body: {{val}}', { val: '$1 ${0} \\n' });
    expect(out).toBe('Body: $1 ${0} \\n');
  });
});
