/**
 * callout.ts
 *
 * Obsidian-style callout rendering inside Milkdown.
 *
 * Callout syntax:
 *   > [!note]
 *   > Content here
 *
 * Strategy: we use a ProseMirror plugin that scans blockquote nodes and, if
 * the first text node matches /^\[!(note|warning|info|tip|error)\]/, wraps
 * the blockquote DOM element with a callout class. This is a display-only
 * decoration — the underlying Markdown round-trips clean as a standard
 * blockquote (Obsidian-compatible).
 *
 * Per the spec concession: if this is too complex to fully spec out, render
 * as styled blockquotes with a class. That's exactly what we do here.
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type { Node } from '@milkdown/kit/prose/model';

const CALLOUT_RE = /^\[!(note|warning|info|tip|error)\]\s*/i;

const CALLOUT_COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  note:    { border: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  icon: '📝' },
  warning: { border: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  icon: '⚠️' },
  info:    { border: '#34d399', bg: 'rgba(52,211,153,0.08)',  icon: 'ℹ️' },
  tip:     { border: '#a78bfa', bg: 'rgba(167,139,250,0.08)', icon: '💡' },
  error:   { border: '#f87171', bg: 'rgba(248,113,113,0.08)', icon: '🚫' },
};

const calloutKey = new PluginKey('callout-decorations');

export const calloutPlugin = $prose(() => {
  return new Plugin({
    key: calloutKey,
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        const { doc } = state;

        doc.descendants((node: Node, pos: number) => {
          if (node.type.name !== 'blockquote') return true;

          // Check if first text content matches callout pattern
          let firstText = '';
          node.descendants((child: Node) => {
            if (firstText) return false;
            if (child.isText) { firstText = child.text ?? ''; return false; }
            return true;
          });

          const m = CALLOUT_RE.exec(firstText);
          if (!m) return true;

          const kind = (m[1] ?? 'note').toLowerCase();
          const colors = CALLOUT_COLORS[kind] ?? CALLOUT_COLORS['note']!;

          // Add a widget decoration before the blockquote for the type badge
          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
              class: `callout callout-${kind}`,
              style: [
                `border-left: 3px solid ${colors.border}`,
                `background: ${colors.bg}`,
                `border-radius: 4px`,
                `padding: 8px 12px`,
                `margin: 8px 0`,
              ].join(';'),
            }),
          );

          return true;
        });

        return DecorationSet.create(doc, decorations);
      },
    },
  });
});
