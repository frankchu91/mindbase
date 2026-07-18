import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { auditProjectLayouts, assertV2Project } from '../layout-guard.js';

describe('auditProjectLayouts', () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = join(tmpdir(), `layout-guard-test-${Date.now()}`);
    await mkdir(join(dataDir, 'projects', 'v2-project'), { recursive: true });
    await writeFile(join(dataDir, 'projects', 'v2-project', 'README.md'), '# hi');
    await mkdir(join(dataDir, 'projects', 'v1-project', 'wiki'), { recursive: true });
    await writeFile(join(dataDir, 'projects', 'v1-project', 'wiki', 'schema.md'), 'legacy');
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('sorts projects into v1 vs v2 buckets', async () => {
    const result = await auditProjectLayouts(dataDir);
    expect(result.v2).toContain('v2-project');
    expect(result.v1Skipped).toContain('v1-project');
  });

  it('returns empty for missing projects dir', async () => {
    const result = await auditProjectLayouts(join(tmpdir(), `nope-${Date.now()}`));
    expect(result.v2).toEqual([]);
    expect(result.v1Skipped).toEqual([]);
  });
});

describe('assertV2Project', () => {
  it('throws V1_LAYOUT_UNSUPPORTED for v1 projects', () => {
    expect(() => assertV2Project('v1', 'demo')).toThrow(/V1_LAYOUT_UNSUPPORTED/);
  });
  it('does not throw for v2', () => {
    expect(() => assertV2Project('v2', 'demo')).not.toThrow();
  });
});
