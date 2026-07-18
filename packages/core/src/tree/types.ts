import type { Folder } from '../classify/folders';
import type { WikiFileSummary } from '../types';

/** A node's identity in the unified tree. `kind` discriminates. */
export type TreeNodeId =
  | { kind: 'note'; slug: string }
  | { kind: 'folder'; path: string };

/** A single node in the rendered tree. `data` carries the type-specific payload. */
export interface TreeNode {
  id: TreeNodeId;
  parent: TreeNodeId | null;
  order: string;
  /** Depth from root, 0-indexed. */
  depth: number;
  /** Type-specific payload for renderers. */
  data:
    | { type: 'folder'; folder: Folder }
    | { type: 'note'; note: WikiFileSummary };
  children: TreeNode[];
}

/** String encoding of a node id for use in `parent` fields and DnD payloads. */
export function encodeNodeId(id: TreeNodeId): string {
  return id.kind === 'note' ? `note:${id.slug}` : `folder:${id.path}`;
}

/** Parse a `note:<slug>` or `folder:<path>` string back into a TreeNodeId. Returns null for malformed. */
export function decodeNodeId(s: string | null | undefined): TreeNodeId | null {
  if (!s || typeof s !== 'string') return null;
  if (s.startsWith('note:')) {
    const slug = s.slice('note:'.length);
    return slug ? { kind: 'note', slug } : null;
  }
  if (s.startsWith('folder:')) {
    const path = s.slice('folder:'.length);
    return path ? { kind: 'folder', path } : null;
  }
  return null;
}

/** Two ids are equal when both kind and identifier match. */
export function sameNodeId(a: TreeNodeId, b: TreeNodeId): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'note' && b.kind === 'note') return a.slug === b.slug;
  if (a.kind === 'folder' && b.kind === 'folder') return a.path === b.path;
  return false;
}
