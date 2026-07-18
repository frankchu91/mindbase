import { describe, it, expect } from 'vitest';
import { classifyLinks, type ClassifyContext } from './classify-edges';
import type { ExtractedLink } from './extract-links';

function ctx(overrides: Partial<ClassifyContext> = {}): ClassifyContext {
  return { pageSlug: 'host', pageType: 'concept', body: '', ...overrides };
}
function link(target: string, contextSnippet: string, section: string | null = null): ExtractedLink {
  return { target, confidence: 'extracted', contextSnippet, section };
}

describe('classifyLinks — Pass A per-edge regex', () => {
  it('classifies "see [[X]] for details" as elaborates', () => {
    const r = classifyLinks([link('rag', 'see [[rag]] for details')], ctx());
    expect(r[0]?.edgeType).toBe('elaborates');
    expect(r[0]?.confidence).toBe('extracted');
    expect(r[0]?.inferenceRule).toBe('elaborates_see');
  });

  it('classifies "as described in [[X]]" as elaborates', () => {
    const r = classifyLinks([link('rfc', 'as described in [[rfc]]')], ctx());
    expect(r[0]?.edgeType).toBe('elaborates');
  });

  it('classifies "per [[X]]" as cites', () => {
    const r = classifyLinks([link('paper', 'per [[paper]], results show…')], ctx());
    expect(r[0]?.edgeType).toBe('cites');
    expect(r[0]?.inferenceRule).toBe('cites_per');
  });

  it('classifies "cf. [[X]]" as cites', () => {
    const r = classifyLinks([link('x', 'cf. [[x]]')], ctx());
    expect(r[0]?.edgeType).toBe('cites');
  });

  it('classifies "vs [[X]]" as contradicts', () => {
    const r = classifyLinks([link('alt', 'our approach vs [[alt]] performs better')], ctx());
    expect(r[0]?.edgeType).toBe('contradicts');
  });

  it('classifies "unlike [[X]]" as contradicts', () => {
    const r = classifyLinks([link('alt', 'unlike [[alt]], we use…')], ctx());
    expect(r[0]?.edgeType).toBe('contradicts');
  });

  it('classifies "replaces [[X]]" as supersedes', () => {
    const r = classifyLinks([link('old', 'this method replaces [[old]]')], ctx());
    expect(r[0]?.edgeType).toBe('supersedes');
  });

  it('classifies "is a kind of [[X]]" as is_a', () => {
    const r = classifyLinks([link('parent', 'RAG is a kind of [[parent]] approach')], ctx());
    expect(r[0]?.edgeType).toBe('is_a');
  });

  it('classifies "part of [[X]]" as part_of', () => {
    const r = classifyLinks([link('whole', 'attention is part of [[whole]]')], ctx());
    expect(r[0]?.edgeType).toBe('part_of');
  });

  it('classifies "example of [[X]]" as example_of', () => {
    const r = classifyLinks([link('cat', 'GPT is an example of [[cat]]')], ctx());
    expect(r[0]?.edgeType).toBe('example_of');
  });

  it('falls back to mentions when no Pass A rule fires on a concept page', () => {
    const r = classifyLinks([link('x', 'Some prose mentioning [[x]] in passing.')], ctx());
    expect(r[0]?.edgeType).toBe('mentions');
    expect(r[0]?.confidence).toBe('extracted');
    expect(r[0]?.inferenceRule).toBeNull();
  });

  it('first matching rule wins (rules tried in declared order)', () => {
    // "see [[X]] per [[X]]" — the elaborates rule appears first in the rule
    // list, so it should win.
    const r = classifyLinks([link('x', 'see [[x]] per [[x]]')], ctx());
    expect(r[0]?.edgeType).toBe('elaborates');
  });
});

describe('classifyLinks — section override', () => {
  it('forces cites inside ## Sources', () => {
    const r = classifyLinks([link('paper', 'just [[paper]] alone', 'Sources')], ctx());
    expect(r[0]?.edgeType).toBe('cites');
    expect(r[0]?.inferenceRule).toBe('section_sources');
  });

  it('forces cites inside ## References', () => {
    const r = classifyLinks([link('x', '[[x]]', 'References')], ctx());
    expect(r[0]?.edgeType).toBe('cites');
  });

  it('forces cites inside ## Citations', () => {
    const r = classifyLinks([link('x', '[[x]]', 'Citations')], ctx());
    expect(r[0]?.edgeType).toBe('cites');
  });

  it('forces elaborates inside ## See also', () => {
    const r = classifyLinks([link('x', '[[x]]', 'See also')], ctx());
    expect(r[0]?.edgeType).toBe('elaborates');
    expect(r[0]?.inferenceRule).toBe('section_see_also');
  });

  it('section override beats Pass A regex', () => {
    // "vs [[X]]" would normally be contradicts, but inside Sources it should be cites.
    const r = classifyLinks([link('x', 'vs [[x]]', 'Sources')], ctx());
    expect(r[0]?.edgeType).toBe('cites');
  });

  it('section override is case-insensitive', () => {
    const r1 = classifyLinks([link('x', '[[x]]', 'SOURCES')], ctx());
    const r2 = classifyLinks([link('x', '[[x]]', 'sources')], ctx());
    expect(r1[0]?.edgeType).toBe('cites');
    expect(r2[0]?.edgeType).toBe('cites');
  });
});

describe('classifyLinks — Pass B page-role prior', () => {
  it('paper-type page defaults unmatched links to cites with INFERRED confidence', () => {
    const r = classifyLinks(
      [link('ref', 'Just mentions [[ref]] without verb cues.')],
      ctx({ pageType: 'paper' }),
    );
    expect(r[0]?.edgeType).toBe('cites');
    expect(r[0]?.confidence).toBe('inferred');
    expect(r[0]?.inferenceRule).toBe('prior_paper_cites');
  });

  it('Pass A still wins over Pass B on a paper page', () => {
    const r = classifyLinks(
      [link('alt', 'unlike [[alt]] our method…')],
      ctx({ pageType: 'paper' }),
    );
    expect(r[0]?.edgeType).toBe('contradicts');
    expect(r[0]?.confidence).toBe('extracted');
  });

  it('daily-type page defaults unmatched links to mentions (no override)', () => {
    const r = classifyLinks(
      [link('x', 'Daily note mentioning [[x]].')],
      ctx({ pageType: 'daily' }),
    );
    expect(r[0]?.edgeType).toBe('mentions');
  });

  it('section override beats Pass B prior', () => {
    const r = classifyLinks(
      [link('x', '[[x]]', 'See also')],
      ctx({ pageType: 'paper' }),
    );
    expect(r[0]?.edgeType).toBe('elaborates');
  });
});

describe('classifyLinks — confidence', () => {
  it('preserves AMBIGUOUS marker from extract layer', () => {
    const r = classifyLinks(
      [{ target: 'x', confidence: 'ambiguous', contextSnippet: '[[x]]', section: null }],
      ctx(),
    );
    expect(r[0]?.confidence).toBe('ambiguous');
  });

  it('preserves INFERRED marker from extract layer even if Pass A would fire', () => {
    // User explicitly wrote ^[inferred] — that's their call, respect it.
    const r = classifyLinks(
      [{ target: 'x', confidence: 'inferred', contextSnippet: 'see [[x]] for details', section: null }],
      ctx(),
    );
    expect(r[0]?.edgeType).toBe('elaborates');     // Pass A still classifies the type
    expect(r[0]?.confidence).toBe('inferred');    // but confidence stays as user said
  });
});
