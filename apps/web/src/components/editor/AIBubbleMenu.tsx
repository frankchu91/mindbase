import { useEffect, useState } from 'react';
import { Sparkles, ArrowRight, Plus, Languages } from 'lucide-react';

// Loose ProseMirror view interface — keep decoupled from Milkdown internals.
interface EditorViewLike {
  state: {
    selection: { from: number; to: number; empty: boolean };
    doc: { textBetween(from: number, to: number, sep?: string): string };
  };
  coordsAtPos(pos: number): { left: number; top: number; bottom: number };
  dom: HTMLElement;
}

interface Props {
  /** ProseMirror EditorView from the host editor; null while editor is mounting. */
  view: EditorViewLike | null;
  /** Container element (unused for positioning but kept for future clamping). */
  containerEl: HTMLElement | null;
  /** Invoked when a menu action is chosen. */
  onAction(
    kind: 'summarize' | 'continue' | 'expand' | 'translate',
    payload: { selectionText: string; from: number; to: number },
  ): void;
  /** True while an AI call is in-flight; hides menu + disables actions. */
  busy: boolean;
}

const MIN_SELECTION_CHARS = 3;

export function AIBubbleMenu({ view, containerEl, onAction, busy }: Props) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [selectionText, setSelectionText] = useState('');
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!view) return;
    let rafId: number | null = null;
    function doRecompute() {
      if (!view) return;
      // Ignore selection changes that aren't inside our editor — avoids
      // layout-thrashing coordsAtPos() calls every time the user clicks
      // into any other input on the page, or every cursor blink.
      const active = document.activeElement;
      const editorHasFocus =
        active === view.dom ||
        view.dom.contains(active) ||
        (containerEl !== null && containerEl.contains(active));
      if (!editorHasFocus) {
        setPos(null);
        return;
      }
      const { from, to, empty } = view.state.selection;
      if (empty || to - from < MIN_SELECTION_CHARS) {
        setPos(null);
        return;
      }
      const txt = view.state.doc.textBetween(from, to, '\n');
      if (!txt.trim()) {
        setPos(null);
        return;
      }
      const startCoords = view.coordsAtPos(from);
      const endCoords = view.coordsAtPos(to);
      const left = (startCoords.left + endCoords.left) / 2;
      const top = startCoords.top - 8;
      setPos({ left, top });
      setSelectionText(txt);
      setRange({ from, to });
    }
    function recompute() {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        doRecompute();
      });
    }
    document.addEventListener('selectionchange', recompute);
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    recompute();
    return () => {
      document.removeEventListener('selectionchange', recompute);
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [view, containerEl]);

  if (!pos || busy || !range) return null;

  const actions: Array<{
    id: 'summarize' | 'continue' | 'expand' | 'translate';
    label: string;
    icon: typeof Sparkles;
  }> = [
    { id: 'summarize', label: 'Summarize', icon: Sparkles },
    { id: 'continue', label: 'Continue', icon: ArrowRight },
    { id: 'expand', label: 'Expand', icon: Plus },
    { id: 'translate', label: 'Translate', icon: Languages },
  ];

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 rounded-md px-1 py-0.5"
      style={{
        left: Math.max(8, pos.left - 100),
        top: pos.top - 32,
        background: 'var(--win-bg)',
        border: '0.5px solid var(--hairline)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
      }}
      onMouseDown={(e) => e.preventDefault() /* don't blur the editor */}
      data-testid="ai-bubble-menu"
    >
      {actions.map((a) => (
        <button
          key={a.id}
          onClick={() => onAction(a.id, { selectionText, from: range.from, to: range.to })}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11.5px] cursor-pointer"
          style={{ color: 'var(--text-default)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title={`AI: ${a.label}`}
          data-testid={`ai-bubble-${a.id}`}
        >
          <a.icon size={11} strokeWidth={1.8} />
          {a.label}
        </button>
      ))}
    </div>
  );
}
