import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrateProject } from '../pipeline.js';

describe('migrateProject', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = join(tmpdir(), `mb-migrate-test-${Date.now()}`);
    const root = join(dataDir, 'projects', 'demo');
    await mkdir(join(root, 'wiki', 'notes'), { recursive: true });
    await mkdir(join(root, 'wiki', 'sources'), { recursive: true });
    await mkdir(join(root, 'wiki', 'concepts'), { recursive: true });
    await writeFile(join(root, 'wiki', 'schema.md'), '---\nstatus_vocab: [wip, done]\n---\nDemo schema body.\n');
    await writeFile(join(root, 'wiki', 'INDEX.md'), '# Index\n- [a](a.md)\n');
    await writeFile(join(root, 'wiki', 'log.md'), '## [2026-06-01 09:00] ingest | topic A\n## [2026-06-02 10:00] ingest | topic B\n');
    await writeFile(join(root, 'wiki', 'notes', 'daily-2026-06-01.md'), 'today A\n');
    await writeFile(join(root, 'wiki', 'notes', 'idea-foo.md'), 'idea body\n');
    await writeFile(join(root, 'wiki', 'sources', 'paper.md'), 'paper body\n');
    await writeFile(join(root, 'wiki', 'concepts', 'rag.md'), 'rag definition\n');
    await writeFile(join(root, 'meta.json'), JSON.stringify({ name: 'Demo Project' }));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('produces v2-layout files and archive', async () => {
    const report = await migrateProject({ dataDir, projectId: 'demo', user: 'alice', unixTs: 1700000000 });
    const root = join(dataDir, 'projects', 'demo');
    expect(report.contributorsMoved).toBeGreaterThanOrEqual(2);
    expect(report.researchMoved).toBeGreaterThanOrEqual(1);
    expect(report.logDays).toBeGreaterThanOrEqual(2);

    expect((await readFile(join(root, 'README.md'), 'utf-8'))).toContain('Contribution Rules');
    expect((await readFile(join(root, 'context.md'), 'utf-8'))).toContain('Demo Project — Context');
    expect((await readFile(join(root, 'sources/contributors/alice/2026-06-01.md'), 'utf-8'))).toContain('today A');
    expect((await readFile(join(root, 'sources/contributors/alice/idea-foo.md'), 'utf-8'))).toContain('idea body');
    expect((await readFile(join(root, 'sources/research/paper.md'), 'utf-8'))).toContain('paper body');
    expect((await readdir(join(root, 'logs'))).length).toBeGreaterThanOrEqual(2);
    expect((await readFile(join(root, 'MIGRATED.md'), 'utf-8'))).toContain('Archive:');
  });
});
