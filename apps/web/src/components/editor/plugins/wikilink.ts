/**
 * wikilink.ts
 *
 * Milkdown custom inline node for [[slug|label]] wikilinks.
 *
 * - Parses [[slug]] and [[slug|label]] from Markdown
 * - Serializes back to [[slug|label]] (or [[slug]] if label === slug)
 * - Renders as <a class="wikilink"> chip in the editor
 * - click/hover handled by parent component via event delegation on editorViewCtx
 *
 * Uses Milkdown v7 $node + $inputRule + a remark plugin to parse wikilinks.
 */

import { $node, $inputRule, $prose } from '@milkdown/kit/utils';
import { remarkPluginsCtx } from '@milkdown/kit/core';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import type { NodeType } from '@milkdown/kit/prose/model';
import type { MarkdownNode, SerializerState } from '@milkdown/kit/transformer';

// ---------------------------------------------------------------------------
// Remark plugin: transform [[slug|label]] text into custom AST nodes
// ---------------------------------------------------------------------------

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function remarkWikilink(): (tree: any) => void {
  return (tree: MarkdownNode) => {
    visit(tree, 'text', (node: MarkdownNode, index: number | null, parent: MarkdownNode | null) => {
      if (!parent || index === null) return;
      const value = node['value'] as string;
      if (!WIKILINK_RE.test(value)) return;
      WIKILINK_RE.lastIndex = 0;

      const children: MarkdownNode[] = [];
      let last = 0;
      let m: RegExpExecArray | null;

      while ((m = WIKILINK_RE.exec(value)) !== null) {
        if (m.index > last) {
          children.push({ type: 'text', value: value.slice(last, m.index) } as MarkdownNode);
        }
        const target = (m[1] ?? '').trim();
        const label = (m[2] ?? target).trim();
        children.push({
          type: 'wikilink',
          data: {
            hName: 'wikilink',
            hProperties: { target, label },
          },
          target,
          label,
        } as MarkdownNode);
        last = m.index + m[0].length;
      }

      if (children.length === 0) return;
      if (last < value.length) {
        children.push({ type: 'text', value: value.slice(last) } as MarkdownNode);
      }

      parent.children!.splice(index, 1, ...children);
    });
  };
}

// Tiny unist visitor (avoid importing unist-util-visit to keep bundle small)
function visit(
  node: MarkdownNode,
  type: string,
  visitor: (node: MarkdownNode, index: number | null, parent: MarkdownNode | null) => void,
): void {
  if (node.type === type) visitor(node, null, null);
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!;
      if (child.type === type) {
        visitor(child, i, node);
        // Re-check index in case spliced
        i = node.children.indexOf(child);
        if (i === -1) i = -1; // removed
      } else {
        visit(child, type, visitor);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Milkdown node schema
// ---------------------------------------------------------------------------

export const wikilinkNode = $node('wikilink', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    target: { default: '' },
    label: { default: '' },
  },
  parseDOM: [
    {
      tag: 'a[data-wikilink]',
      getAttrs(dom: HTMLElement | string) {
        if (typeof dom === 'string') return {};
        return {
          target: dom.getAttribute('data-target') ?? '',
          label: dom.getAttribute('data-label') ?? '',
        };
      },
    },
  ],
  toDOM(node) {
    const { target, label } = node.attrs as { target: string; label: string };
    return [
      'a',
      {
        'data-wikilink': 'true',
        'data-target': target,
        'data-label': label,
        class: 'wikilink-chip',
        href: `#wiki:${target}`,
      },
      label || target,
    ];
  },
  toMarkdown: {
    match: (node) => node.type.name === 'wikilink',
    runner(state: SerializerState, node) {
      const { target, label } = node.attrs as { target: string; label: string };
      const text = label && label !== target ? `[[${target}|${label}]]` : `[[${target}]]`;
      state.addNode('text', [], text);
    },
  },
  parseMarkdown: {
    match: (node) => node.type === 'wikilink',
    runner(state, node, type: NodeType) {
      const target = (node['target'] as string) ?? '';
      const label = (node['label'] as string) ?? target;
      state.addNode(type, { target, label });
    },
  },
}));

// ---------------------------------------------------------------------------
// Input rule: typing [[...]] inserts a wikilink node
// ---------------------------------------------------------------------------

export const wikilinkInputRule = $inputRule((ctx) => {
  const wikilinkType = wikilinkNode.type(ctx);
  return new InputRule(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/,
    (state, match, start, end) => {
      const target = (match[1] ?? '').trim();
      const label = (match[2] ?? target).trim();
      const node = wikilinkType.create({ target, label });
      return state.tr.replaceWith(start, end, node);
    },
  );
});

// ---------------------------------------------------------------------------
// Remark plugin registration
// ---------------------------------------------------------------------------

export const wikilinkRemarkPlugin: MilkdownPlugin = (ctx) => async () => {
  ctx.get(remarkPluginsCtx).push({ plugin: remarkWikilink as import('@milkdown/kit/transformer').RemarkPlugin['plugin'], options: {} });
};

// ---------------------------------------------------------------------------
// Hover / click via ProseMirror plugin (event delegation)
// ---------------------------------------------------------------------------

const wikilinkKey = new PluginKey('wikilink-interactions');

export function makeWikilinkInteractionPlugin(
  onHover: (target: string, anchorEl: HTMLElement) => void,
  onHoverOut: () => void,
  onClick: (target: string, modifiers: { meta: boolean; ctrl: boolean }) => void,
) {
  return $prose(() => {
    // Track which chip the cursor is currently OVER (by pixel position,
    // not DOM events). This sidesteps all the ProseMirror atom-node /
    // ZWC-text-node / contenteditable-toggling weirdness that made the
    // mouseover/mouseout approach unreliable.
    //
    // We use mousemove + document.elementFromPoint to compute, on every
    // frame the cursor moves, which chip (if any) the cursor is over.
    // Transitions fire onHover / onHoverOut. No bubbling, no text-node
    // edge cases, no relatedTarget gymnastics.
    let currentChip: HTMLElement | null = null;
    let lastMoveAt = 0;
    return new Plugin({
      key: wikilinkKey,
      props: {
        handleDOMEvents: {
          mousemove(_view, event: Event) {
            const now = performance.now();
            if (now - lastMoveAt < 30) return false; // throttle ~30Hz
            lastMoveAt = now;
            const e = event as MouseEvent;
            const hit = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
            const newChip = hit?.closest?.('a.wikilink-chip') as HTMLElement | null;
            if (newChip === currentChip) return false;
            // Real transition.
            if (currentChip && !newChip) {
              currentChip = null;
              onHoverOut();
              return false;
            }
            if (newChip) {
              const target = newChip.getAttribute('data-target') ?? '';
              if (!target) return false;
              currentChip = newChip;
              onHover(target, newChip);
            }
            return false;
          },
          mouseleave(_view, _event: Event) {
            // Cursor left the editor entirely — could be going to the
            // popover (which lives outside the editor's DOM) or anywhere
            // else. Fire onHoverOut; the popover's own onMouseEnter will
            // cancel the resulting hide-schedule if cursor lands on it.
            if (currentChip) {
              currentChip = null;
              onHoverOut();
            }
            return false;
          },
          // ProseMirror selects atom nodes (which wikilink-chip is) on
          // mousedown — BEFORE click fires. By the time our click handler
          // gets to preventDefault, the selection has already happened
          // and the user sees the chip highlighted as a node-selection
          // box. Intercept at mousedown to win the race.
          mousedown(_view, event: Event) {
            const e = event as MouseEvent;
            if (e.button !== 0) return false; // only left-click
            const tEl = e.target instanceof Element ? e.target : (e.target as Node).parentElement;
            const el = tEl?.closest('a.wikilink-chip') as HTMLElement | null;
            if (!el) return false;
            e.preventDefault();
            e.stopPropagation();
            const target = el.getAttribute('data-target') ?? '';
            if (target) onClick(target, { meta: e.metaKey, ctrl: e.ctrlKey });
            return true; // tell ProseMirror we consumed it
          },
          click(_view, event: Event) {
            // Backup: in case mousedown was missed, still intercept click
            // and prevent the default <a href="#wiki:..."> hash navigation.
            const e = event as MouseEvent;
            const tEl = e.target instanceof Element ? e.target : (e.target as Node).parentElement;
            const el = tEl?.closest('a.wikilink-chip') as HTMLElement | null;
            if (!el) return false;
            e.preventDefault();
            return true;
          },
        },
      },
    });
  });
}

// All plugins exported as an array for easy .use()
export const wikilinkPlugins = [wikilinkNode, wikilinkInputRule, wikilinkRemarkPlugin];
