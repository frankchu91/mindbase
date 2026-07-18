import { mkdir, cp } from 'node:fs/promises';
import { join } from 'node:path';

/** Copies <root>/projects/<id> to <root>/archive/<id>-<unixTs>. Returns archive path. */
export async function snapshotProject(dataDir: string, projectId: string, unixTs: number): Promise<string> {
  const src = join(dataDir, 'projects', projectId);
  const dst = join(dataDir, 'archive', `${projectId}-${unixTs}`);
  await mkdir(join(dataDir, 'archive'), { recursive: true });
  await cp(src, dst, { recursive: true });
  return dst;
}
