import type { Store } from '../storage/store';
import { indexPath } from '../storage/paths';

export interface IndexEntry {
  title: string;
  path: string;
  one_liner: string;
}

const PLACEHOLDER = '# MindBase Wiki Index\n\n(empty)\n';

export async function readIndex(store: Store): Promise<string> {
  const path = indexPath();
  if (!(await store.exists(path))) return PLACEHOLDER;
  return store.readText(path);
}

const BULLET_RE = /^\s*-\s*\[([^\]]+)\]\(([^)]+)\)\s*[—-]\s*(.+?)\s*$/;

export function parseIndex(text: string): IndexEntry[] {
  const out: IndexEntry[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(BULLET_RE);
    if (!m) continue;
    const [, title, path, one_liner] = m;
    if (title && path && one_liner) out.push({ title, path, one_liner });
  }
  return out;
}
