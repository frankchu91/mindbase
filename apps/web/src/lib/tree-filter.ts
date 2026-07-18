import type { TreeNode, TreeNodeId } from '@mindbase/core';

/**
 * Returns the children of the hoisted root, or the hoisted node itself if it's
 * a note (notes have no children). Returns the original tree if root is null
 * (passthrough). Returns [] if the hoisted node is not found.
 *
 * Pure function — no DOM, no store access.
 */
function sameId(a: TreeNodeId, b: TreeNodeId): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'note' && b.kind === 'note') return a.slug === b.slug;
  if (a.kind === 'folder' && b.kind === 'folder') return a.path === b.path;
  return false;
}

function findNode(level: TreeNode[], target: TreeNodeId): TreeNode | null {
  for (const node of level) {
    if (sameId(node.id, target)) return node;
    const hit = findNode(node.children, target);
    if (hit) return hit;
  }
  return null;
}

export function filterToSubtree(
  tree: TreeNode[],
  root: TreeNodeId | null,
): TreeNode[] {
  if (!root) return tree;

  const node = findNode(tree, root);
  if (!node) return [];
  if (node.id.kind === 'note') return [node];
  return node.children;
}
