import type { Folder } from '../classify/folders';
import type { WikiFileSummary } from '../types';
import type { TreeNode, TreeNodeId } from './types';
import { encodeNodeId, decodeNodeId, sameNodeId } from './types';
import { compareOrder } from './order';

export interface BuildTreeInput {
  folders: Folder[];
  notes: WikiFileSummary[];
}

/**
 * Build the unified tree from folders + note summaries.
 *
 * Rules:
 * - Folder parents are `null` (root) or `"folder:<other-path>"`.
 * - Note parents are `null`, `"folder:<path>"`, or `"note:<slug>"`.
 * - When a note lacks `parent` but has legacy `folder`, treat as `"folder:<folder>"`.
 * - When parent points at a nonexistent node, the node becomes a root orphan.
 * - When a node lists itself as parent, the cycle is broken — the node becomes a root.
 * - Siblings are sorted by `order` ascending; missing `order` sorts last.
 */
export function buildTree(input: BuildTreeInput): TreeNode[] {
  // Build flat node list with resolved parent ids.
  const nodes: TreeNode[] = [];

  for (const f of input.folders) {
    nodes.push({
      id: { kind: 'folder', path: f.path },
      parent: decodeNodeId(f.parent),
      order: f.order ?? '￿', // missing order sorts last
      depth: 0, // set in second pass
      data: { type: 'folder', folder: f },
      children: [],
    });
  }

  for (const n of input.notes) {
    const explicitParent = decodeNodeId(n.parent);
    const fallbackParent =
      explicitParent ?? (n.folder ? decodeNodeId(`folder:${n.folder}`) : null);
    nodes.push({
      id: { kind: 'note', slug: n.slug },
      parent: fallbackParent,
      order: n.order ?? '￿',
      depth: 0,
      data: { type: 'note', note: n },
      children: [],
    });
  }

  // Index by encoded id for O(1) parent lookup
  const byId = new Map<string, TreeNode>();
  for (const node of nodes) byId.set(encodeNodeId(node.id), node);

  const roots: TreeNode[] = [];
  for (const node of nodes) {
    if (!node.parent) {
      roots.push(node);
      continue;
    }
    // Self-cycle → treat as root
    if (sameNodeId(node.parent, node.id)) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(encodeNodeId(node.parent));
    if (!parent) {
      // Orphan → promote to root
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  // Sort each level by order, recursively, and assign depth
  function sortAndDepth(level: TreeNode[], depth: number): void {
    level.sort((a, b) => compareOrder(a.order, b.order));
    for (const node of level) {
      node.depth = depth;
      if (node.children.length > 0) sortAndDepth(node.children, depth + 1);
    }
  }
  sortAndDepth(roots, 0);

  return roots;
}
