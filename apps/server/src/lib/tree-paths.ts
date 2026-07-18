import path from 'node:path';
import { projectPaths } from '@mindbase/core';

export type TreeCategory =
  | 'readme'
  | 'context'
  | 'soul'
  | 'contributors'
  | 'research'
  | 'raw'
  | 'logs'
  | 'artifacts';

export const TREE_CATEGORIES: readonly TreeCategory[] = [
  'readme', 'context', 'soul', 'contributors', 'research', 'raw', 'logs', 'artifacts',
];

const SINGLE_FILE = new Set<TreeCategory>(['readme', 'context', 'soul']);

export function isSingleFileCategory(category: TreeCategory): boolean {
  return SINGLE_FILE.has(category);
}

export function isPathSafe(relPath: string): boolean {
  if (relPath.startsWith('/')) return false;
  const normalized = path.posix.normalize(relPath);
  if (normalized.startsWith('..')) return false;
  if (normalized.includes('/../') || normalized === '..') return false;
  return true;
}

export function resolveTreePath(category: TreeCategory, relPath: string, user: string): string {
  const p = projectPaths();
  if (category === 'readme') return p.readme;
  if (category === 'context') return p.context;
  if (category === 'soul') return p.soul;
  if (category === 'contributors') {
    return `${p.contributorsRoot}/${user}/${relPath}`;
  }
  if (category === 'research') return `${p.researchDir}/${relPath}`;
  if (category === 'raw') return `${p.rawDir}/${relPath}`;
  if (category === 'logs') return `${p.logsRoot}/${relPath}`;
  if (category === 'artifacts') return `${p.artifactsRoot}/${relPath}`;
  const _exhaustive: never = category;
  throw new Error(`Unknown category: ${_exhaustive as string}`);
}
