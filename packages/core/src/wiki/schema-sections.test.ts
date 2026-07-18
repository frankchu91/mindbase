import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { parseSchemaSections, loadSchemaSections } from './schema-sections';
import { ensureSchema, SCHEMA_PATH } from './schema';

describe('parseSchemaSections', () => {
  it('extracts named sections by H2 header', () => {
    const body = `# Title

## Page conventions
Use H1 for the title.

## Page types
- Concept
- Entity

## Other section
ignored

## Linking conventions
Use cites freely.`;
    const s = parseSchemaSections(body);
    expect(s.conventions).toContain('Use H1');
    expect(s.types).toContain('Concept');
    expect(s.linking).toContain('Use cites');
    expect(s.ingestPrefs).toBeUndefined();
  });

  it('returns empty object when no matching sections', () => {
    expect(parseSchemaSections('# Hello\n\nbody only')).toEqual({});
  });

  it('matches "Ingest preferences" without "workflow" keyword', () => {
    const s = parseSchemaSections(`## Ingest preferences\nbe aggressive`);
    expect(s.ingestPrefs).toBeDefined();
    expect(s.ingestPrefs).toContain('be aggressive');
  });

  it('matches "Ingest workflow preferences" with "workflow" keyword', () => {
    const s = parseSchemaSections(`## Ingest workflow preferences\nrun batch`);
    expect(s.ingestPrefs).toBeDefined();
    expect(s.ingestPrefs).toContain('run batch');
  });

  it('extracts section body until next H2', () => {
    const body = `## Linking conventions
Use cites freely.
Multiple lines here.

## Ingest preferences
be fast`;
    const s = parseSchemaSections(body);
    expect(s.linking).toContain('Use cites');
    expect(s.linking).toContain('Multiple lines');
    expect(s.linking).not.toContain('be fast');
  });

  it('handles case-insensitive matching', () => {
    const body = `## PAGE CONVENTIONS
use uppercase`;
    const s = parseSchemaSections(body);
    expect(s.conventions).toContain('use uppercase');
  });

  it('includes the H2 header line in the extracted section', () => {
    const body = `## Page conventions
content here`;
    const s = parseSchemaSections(body);
    expect(s.conventions).toContain('## Page conventions');
  });

  it('handles empty section bodies', () => {
    const body = `## Page conventions

## Page types
content`;
    const s = parseSchemaSections(body);
    expect(s.conventions).toBeDefined();
    expect(s.types).toContain('content');
  });

  it('works with real schema.md structure', () => {
    const body = `# MindBase Wiki Schema

_This is the user-editable contract..._

## Project description
Personal research wiki.

## Page conventions
Every wiki/concepts/ page should have:
- **Frontmatter**: title, tags
- **A single H1** matching the title.

## Page types
- **Concept** — an idea
- **Entity** — a person

## Linking conventions
- \`mentions\` — page touches on the other.
- \`elaborates\` — page goes into more detail.

## Ingest workflow preferences
- **Extraction volume**: aim for 5-15 distinct pages
- **Approval mode**: interactive`;

    const s = parseSchemaSections(body);
    expect(s.conventions).toBeDefined();
    expect(s.conventions).toContain('wiki/concepts/');
    expect(s.conventions).toContain('Frontmatter');

    expect(s.types).toBeDefined();
    expect(s.types).toContain('Concept');
    expect(s.types).toContain('Entity');

    expect(s.linking).toBeDefined();
    expect(s.linking).toContain('mentions');
    expect(s.linking).toContain('elaborates');

    expect(s.ingestPrefs).toBeDefined();
    expect(s.ingestPrefs).toContain('Extraction volume');
    expect(s.ingestPrefs).toContain('Approval mode');
  });
});

describe('loadSchemaSections', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('loads and parses sections from store', async () => {
    await ensureSchema(store);
    const s = await loadSchemaSections(store);
    expect(s.conventions).toBeDefined();
    expect(s.types).toBeDefined();
    expect(s.linking).toBeDefined();
    expect(s.ingestPrefs).toBeDefined();
  });

  it('extracts conventions from default schema', async () => {
    await ensureSchema(store);
    const s = await loadSchemaSections(store);
    expect(s.conventions).toContain('Frontmatter');
    expect(s.conventions).toContain('wiki/concepts/');
  });

  it('extracts types from default schema', async () => {
    await ensureSchema(store);
    const s = await loadSchemaSections(store);
    expect(s.types).toContain('Concept');
    expect(s.types).toContain('Entity');
    expect(s.types).toContain('Claim');
  });

  it('respects user-edited schema', async () => {
    const customSchema = `# Custom Schema

## Page conventions
Custom conventions here.`;
    await store.writeText(SCHEMA_PATH, customSchema);
    const s = await loadSchemaSections(store);
    expect(s.conventions).toContain('Custom conventions here');
    expect(s.types).toBeUndefined();
  });
});
