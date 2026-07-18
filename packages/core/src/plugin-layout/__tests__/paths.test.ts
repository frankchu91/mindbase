import { describe, it, expect } from 'vitest';
import { projectPaths } from '../paths.js';

describe('projectPaths', () => {
  const p = projectPaths();

  it('returns v2-layout top-level files', () => {
    expect(p.readme).toBe('README.md');
    expect(p.context).toBe('context.md');
    expect(p.indexYaml).toBe('index.yaml');
    expect(p.soul).toBe('soul.md');
  });

  it('builds contributor day paths', () => {
    expect(p.contributorDay('alice', '2026-06-09'))
      .toBe('sources/contributors/alice/2026-06-09.md');
  });

  it('builds log day paths', () => {
    expect(p.logsDay('2026-06-09')).toBe('logs/2026-06-09.md');
  });

  it('builds research file paths', () => {
    expect(p.researchFile('rag-vs-finetune'))
      .toBe('sources/research/rag-vs-finetune.md');
  });

  it('builds state subdir paths', () => {
    expect(p.stateDir('builder')).toBe('state/builder');
  });
});
