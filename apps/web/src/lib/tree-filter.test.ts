import { describe, it, expect } from 'vitest';
import type { TreeNode, TreeNodeId } from '@mindbase/core';
import { filterToSubtree } from './tree-filter';

function mkFolder(path: string, children: TreeNode[] = []): TreeNode {
  return {
    id: { kind: 'folder', path },
    parent: null,
    order: 'a0',
    depth: 0,
    data: { type: 'folder', folder: { path, name: path, parent: null, order: 'a0' } as never },
    children,
  };
}

function mkNote(slug: string, children: TreeNode[] = []): TreeNode {
  return {
    id: { kind: 'note', slug },
    parent: null,
    order: 'a0',
    depth: 0,
    data: { type: 'note', note: { slug, title: slug, path: `wiki/notes/${slug}.md` } as never },
    children,
  };
}

describe('filterToSubtree', () => {
  it('returns descendants of a hoisted folder', () => {
    const noteA = mkNote('a');
    const noteB = mkNote('b');
    const sub = mkFolder('p/sub', [noteB]);
    const root = mkFolder('p', [noteA, sub]);
    const out = filterToSubtree([root, mkFolder('q')], { kind: 'folder', path: 'p' });
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toEqual({ kind: 'note', slug: 'a' });
    expect(out[1]!.id).toEqual({ kind: 'folder', path: 'p/sub' });
  });

  it('returns the note itself when a note is hoisted', () => {
    const note = mkNote('only');
    const out = filterToSubtree([note], { kind: 'note', slug: 'only' });
    expect(out).toEqual([note]);
  });

  it('returns [] when hoisted node is missing', () => {
    const out = filterToSubtree([mkFolder('p')], { kind: 'folder', path: 'gone' });
    expect(out).toEqual([]);
  });

  it('returns [] for empty tree', () => {
    const out = filterToSubtree([], { kind: 'folder', path: 'anything' });
    expect(out).toEqual([]);
  });

  it('preserves child order', () => {
    const root = mkFolder('p', [mkNote('a'), mkNote('b'), mkNote('c')]);
    const out = filterToSubtree([root], { kind: 'folder', path: 'p' });
    expect(out.map((n) => (n.id.kind === 'note' ? n.id.slug : 'folder'))).toEqual(['a', 'b', 'c']);
  });

  it('returns the tree unchanged (passthrough) when root is null', () => {
    const root = mkFolder('p', [mkNote('a')]);
    const out = filterToSubtree([root], null);
    expect(out).toEqual([root]);
  });
});
