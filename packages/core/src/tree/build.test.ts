import { describe, it, expect } from 'vitest';
import { buildTree } from './build';
import type { Folder } from '../classify/folders';
import type { WikiFileSummary } from '../types';

function f(path: string, name: string, parent: string | null = null, order = 'a0'): Folder {
  return { path, name, created_at: 'now', parent, order };
}

function n(slug: string, title: string, parent: string | null = null, order = 'a0', folder: string | null = null): WikiFileSummary {
  return { path: `wiki/notes/${slug}.md`, slug, title, one_liner: '', folder, parent, order } as WikiFileSummary;
}

describe('buildTree', () => {
  it('returns empty tree for empty input', () => {
    expect(buildTree({ folders: [], notes: [] })).toEqual([]);
  });

  it('puts a top-level folder + a top-level note both at the root, sorted by order', () => {
    const folders = [f('inbox', 'Inbox', null, 'a0')];
    const notes = [n('hello', 'Hello', null, 'a1')];
    const tree = buildTree({ folders, notes });
    expect(tree.length).toBe(2);
    expect(tree[0]!.id).toEqual({ kind: 'folder', path: 'inbox' });
    expect(tree[1]!.id).toEqual({ kind: 'note', slug: 'hello' });
  });

  it('nests notes under a folder via "folder:<path>" parent', () => {
    const folders = [f('journal', 'Journal', null, 'a0')];
    const notes = [n('morning', 'Morning', 'folder:journal', 'a0')];
    const tree = buildTree({ folders, notes });
    expect(tree[0]!.children.length).toBe(1);
    expect(tree[0]!.children[0]!.id).toEqual({ kind: 'note', slug: 'morning' });
  });

  it('nests a note under another note via "note:<slug>" parent', () => {
    const notes = [
      n('parent', 'Parent', null, 'a0'),
      n('child', 'Child', 'note:parent', 'a0'),
    ];
    const tree = buildTree({ folders: [], notes });
    expect(tree.length).toBe(1);
    expect(tree[0]!.children[0]!.id).toEqual({ kind: 'note', slug: 'child' });
  });

  it('uses legacy meta.folder as fallback when parent is absent', () => {
    const folders = [f('knowledge', 'Knowledge', null, 'a0')];
    const notes = [n('legacy', 'Legacy', null, 'a0', 'knowledge')];
    const tree = buildTree({ folders, notes });
    expect(tree.length).toBe(1);
    expect(tree[0]!.children.length).toBe(1);
    expect(tree[0]!.children[0]!.id).toEqual({ kind: 'note', slug: 'legacy' });
  });

  it('orphans (parent points to nonexistent node) become root nodes', () => {
    const notes = [n('orphan', 'Orphan', 'folder:missing', 'a0')];
    const tree = buildTree({ folders: [], notes });
    expect(tree.length).toBe(1);
    expect(tree[0]!.id).toEqual({ kind: 'note', slug: 'orphan' });
  });

  it('sorts siblings by order ascending', () => {
    const notes = [
      n('z', 'Z', null, 'a2'),
      n('a', 'A', null, 'a0'),
      n('m', 'M', null, 'a1'),
    ];
    const tree = buildTree({ folders: [], notes });
    expect(tree.map((t) => t.id.kind === 'note' ? t.id.slug : '')).toEqual(['a', 'm', 'z']);
  });

  it('assigns depth correctly (0 at root, increments per nesting)', () => {
    const folders = [f('outer', 'Outer', null, 'a0')];
    const notes = [
      n('mid', 'Mid', 'folder:outer', 'a0'),
      n('leaf', 'Leaf', 'note:mid', 'a0'),
    ];
    const tree = buildTree({ folders, notes });
    expect(tree[0]!.depth).toBe(0);                          // outer folder
    expect(tree[0]!.children[0]!.depth).toBe(1);             // mid
    expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2); // leaf
  });

  it('breaks self-parent cycles (parent === self) by treating node as root', () => {
    const notes = [n('a', 'A', 'note:a', 'a0')];
    const tree = buildTree({ folders: [], notes });
    expect(tree.length).toBe(1);
    expect(tree[0]!.children.length).toBe(0);
  });
});
