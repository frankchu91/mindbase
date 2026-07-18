/**
 * slash-menu.ts
 *
 * Milkdown SlashProvider integration.
 * Exports a factory that, given a React setState setter and the slug,
 * returns the SlashProvider and a teardown function.
 *
 * The actual menu UI is still rendered via SlashMenu.tsx (React portal).
 * This plugin detects "/" at start of line and surfaces the query string
 * to parent state, which shows/hides the React menu.
 */

import { SlashProvider } from '@milkdown/kit/plugin/slash';
import type { EditorView } from '@milkdown/kit/prose/view';

export interface SlashState {
  pos: { top: number; left: number };
  query: string;
}

export function createSlashProvider(
  editorEl: HTMLElement,
  onShow: (state: SlashState) => void,
  onHide: () => void,
) {
  const menuEl = document.createElement('div');
  menuEl.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;';
  document.body.appendChild(menuEl);

  const provider = new SlashProvider({
    content: menuEl,
    debounce: 50,
    trigger: '/',
    shouldShow(view: EditorView) {
      const { state } = view;
      const { from } = state.selection;
      const line = state.doc.resolve(from).parent;
      const offset = from - state.doc.resolve(from).start();
      const text = line.textContent.slice(0, offset);
      // Show when line content so far is "/" optionally followed by word chars
      return /^\/([^/\n]*)$/.test(text);
    },
  });

  // Patch: override show/hide to pass query + position to React
  const originalShow = provider.show.bind(provider);
  const originalHide = provider.hide.bind(provider);

  provider.onShow = () => {
    originalShow();
    // We'll call onShow from outside via update hook
  };
  provider.onHide = () => {
    originalHide();
    onHide();
  };

  function updateFromView(view: EditorView) {
    const { state } = view;
    const { from } = state.selection;
    const lineStart = state.doc.resolve(from).start();
    const offset = from - lineStart;
    const line = state.doc.resolve(from).parent;
    const text = line.textContent.slice(0, offset);
    const m = text.match(/^\/([^/\n]*)$/);

    if (m) {
      const coords = view.coordsAtPos(from);
      if (coords) {
        const top = Math.min(coords.bottom + 4, window.innerHeight - 4);
        onShow({ pos: { top, left: coords.left }, query: m[1] ?? '' });
      }
    } else {
      onHide();
    }
  }

  function destroy() {
    provider.destroy();
    if (menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
  }

  return { updateFromView, destroy };
}
