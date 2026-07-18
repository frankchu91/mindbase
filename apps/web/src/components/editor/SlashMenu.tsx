import { useEffect, useState, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import { SLASH_COMMANDS, type SlashCommand } from './slashCommands';

interface SlashMenuProps {
  view: EditorView;
  pos: { top: number; left: number };
  query: string;
  onClose: () => void;
  onAI?: (kind: 'continue' | 'summarize' | 'expand' | 'translate') => void;
  /** When provided (Milkdown mode), called instead of cmd.insert(view) */
  onExecute?: (label: string) => void;
}

export function SlashMenu({ view, pos, query, onClose, onAI, onExecute }: SlashMenuProps) {
  const filtered = SLASH_COMMANDS.filter(
    (c) =>
      c.label.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase()),
  );
  const [selected, setSelected] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  function execute(cmd: SlashCommand) {
    if (cmd.ai && onAI) {
      onAI(cmd.ai);
    } else if (onExecute) {
      // Milkdown mode — parent handles insertion
      onExecute(cmd.label);
    } else {
      cmd.insert(view);
    }
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelected((s) => Math.min(filtered.length - 1, s + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelected((s) => Math.max(0, s - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const cmd = filtered[selected];
        if (cmd) execute(cmd);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, selected, onClose]);

  // Group by category
  const byCategory = filtered.reduce(
    (acc, c) => {
      if (!acc[c.category]) acc[c.category] = [];
      acc[c.category]!.push(c);
      return acc;
    },
    {} as Record<string, SlashCommand[]>,
  );

  if (filtered.length === 0) return null;

  // Clamp position so the menu doesn't go off-screen
  const menuWidth = 280;
  const menuMaxHeight = 360;
  let left = pos.left;
  let top = pos.top;
  if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
  if (left < 8) left = 8;
  if (top + menuMaxHeight > window.innerHeight - 8) top = pos.top - menuMaxHeight - 8;
  if (top < 8) top = 8;

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-lg shadow-2xl"
      style={{
        top,
        left,
        width: menuWidth,
        maxHeight: menuMaxHeight,
        overflowY: 'auto',
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        padding: 4,
        fontSize: 13,
      }}
    >
      {Object.entries(byCategory).map(([cat, items]) => (
        <div key={cat}>
          <div
            className="px-3 py-1 text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {cat}
          </div>
          {items.map((cmd) => {
            const idx = filtered.indexOf(cmd);
            const isSelected = idx === selected;
            return (
              <button
                key={cmd.label}
                onMouseEnter={() => setSelected(idx)}
                onClick={() => execute(cmd)}
                className="w-full text-left px-3 py-1.5 rounded"
                style={{
                  background: isSelected ? 'var(--surface-2)' : 'transparent',
                  color: 'var(--text-default)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{cmd.label}</span>
                {cmd.hint && (
                  <span className="text-[11px]" style={{ color: 'var(--text-low)' }}>
                    {cmd.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
