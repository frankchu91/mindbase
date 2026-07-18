import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { detectLayoutVersion, projectRoot } from '../context.js';

export interface LayoutAuditResult {
  v2: string[];
  v1Skipped: string[];
}

export async function auditProjectLayouts(dataDir: string): Promise<LayoutAuditResult> {
  const projectsDir = join(dataDir, 'projects');
  let ids: string[] = [];
  try { ids = await readdir(projectsDir); } catch { return { v2: [], v1Skipped: [] }; }
  const v2: string[] = [];
  const v1Skipped: string[] = [];
  for (const id of ids) {
    const layout = await detectLayoutVersion(projectRoot(dataDir, id));
    if (layout === 'v2') v2.push(id);
    else v1Skipped.push(id);
  }
  return { v2, v1Skipped };
}

export function assertV2Project(layoutVersion: 'v1' | 'v2', projectId: string): void {
  if (layoutVersion === 'v1') {
    throw new Error(`V1_LAYOUT_UNSUPPORTED: ${projectId}`);
  }
}
