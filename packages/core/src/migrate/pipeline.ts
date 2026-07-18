import { join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { snapshotProject } from './snapshot.js';
import { schemaToReadme } from './transforms/schema-to-readme.js';
import { indexToContext } from './transforms/index-to-context.js';
import { notesToContributors } from './transforms/notes-to-contributors.js';
import { sourcesToResearch } from './transforms/sources-to-research.js';
import { logSplit } from './transforms/log-split.js';

export interface MigrateOptions {
  dataDir: string;
  projectId: string;
  user: string;
  unixTs: number;
  dryRun?: boolean;
}

export interface MigrateReport {
  projectId: string;
  archive: string;
  contributorsMoved: number;
  researchMoved: number;
  logDays: number;
  dryRun: boolean;
}

export async function migrateProject(opts: MigrateOptions): Promise<MigrateReport> {
  const { dataDir, projectId, user, unixTs, dryRun = false } = opts;
  const root = join(dataDir, 'projects', projectId);

  if (dryRun) {
    return { projectId, archive: '(dry-run)', contributorsMoved: 0, researchMoved: 0, logDays: 0, dryRun: true };
  }

  // 1. Snapshot.
  const archive = await snapshotProject(dataDir, projectId, unixTs);

  // 2-5. Run transforms.
  await schemaToReadme(root, projectId);
  let projectName = projectId;
  try {
    const meta = JSON.parse(await readFile(join(root, 'meta.json'), 'utf-8')) as { name?: string };
    if (meta.name) projectName = meta.name;
  } catch { /* ok */ }
  const today = new Date().toISOString().slice(0, 10);
  await indexToContext(root, projectName, today);
  const contributors = await notesToContributors(root, user);
  const research = await sourcesToResearch(root);
  const logs = await logSplit(root);

  // 9. Drop a marker.
  const marker = `Migration completed ${new Date().toISOString()}.\nArchive: ${archive}\nLegacy wiki/ dir preserved; safe to remove after /mb:lint passes.\n`;
  await writeFile(join(root, 'MIGRATED.md'), marker, 'utf-8');

  return {
    projectId,
    archive,
    contributorsMoved: contributors.moved,
    researchMoved: research.moved,
    logDays: logs.days,
    dryRun: false,
  };
}
