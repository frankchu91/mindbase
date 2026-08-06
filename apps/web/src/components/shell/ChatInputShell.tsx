import { useRef, useEffect, useState } from 'react';
import { Paperclip, AtSign, Slash, Send } from 'lucide-react';
import { SlashMenu, matchSlashCommands, type SlashCommand } from '../ops/SlashMenu';
import type { OpName } from '../ops/ops-types';

interface ChatInputShellProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  modelName: string;
  onModelClick?: () => void;
  onAttach?: () => void;
  onMention?: () => void;
  onSlashCommand?: () => void;
  /** When set, the composer offers slash ops (/contribute, /build). */
  onRunOp?: (op: OpName, arg: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInputShell({
  value,
  onChange,
  onSend,
  modelName,
  onModelClick,
  onAttach,
  onMention,
  onSlashCommand,
  onRunOp,
  disabled,
  placeholder = 'Ask anything, drop a link, /command…',
}: ChatInputShellProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [rows, setRows] = useState(1);
  const [slashIndex, setSlashIndex] = useState(0);

  const slashCommands = onRunOp ? matchSlashCommands(value) : [];
  const slashOpen = slashCommands.length > 0;

  useEffect(() => setSlashIndex(0), [value]);

  function selectSlash(cmd: SlashCommand) {
    if (!cmd.op) return;
    if (cmd.op === 'build' || cmd.op === 'lint') {
      // Argument-less ops dispatch immediately on selection.
      onChange('');
      onRunOp?.(cmd.op, '');
    } else {
      // Complete the command; the argument (or the op card's input) comes next.
      onChange(`/${cmd.name} `);
      taRef.current?.focus();
    }
  }

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = 6 * 20; // ~6 lines @ 20px line-height
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    setRows(Math.min(Math.ceil(el.scrollHeight / 20), 6));
  }, [value]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashOpen) {
      const selectable = slashCommands.map((c, i) => ({ c, i })).filter(({ c }) => c.op);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectable.length === 0) return;
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const pos = selectable.findIndex(({ i }) => i === slashIndex);
        const next = selectable[(pos + dir + selectable.length) % selectable.length]!;
        setSlashIndex(next.i);
        return;
      }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault();
        const active = slashCommands[slashIndex];
        if (active?.op) selectSlash(active);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onChange('');
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
    // Plain Enter and Shift+Enter both insert newlines (default behavior).
  }

  return (
    <div className="pt-3 pb-3.5 px-4 flex-shrink-0 relative" style={{ borderTop: '0.5px solid var(--hairline)' }}>
      {slashOpen && (
        <SlashMenu
          commands={slashCommands}
          activeIndex={slashIndex}
          onSelect={selectSlash}
          onHover={setSlashIndex}
        />
      )}
      <div
        className="flex flex-col gap-2 px-3 pt-2.5 pb-2"
        style={{
          background: 'var(--input-bg)',
          border: '0.5px solid var(--hairline)',
          borderRadius: 12,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), inset 0 0.5px 1px rgba(255,255,255,0.03)',
        }}
        data-testid="chat-input-shell"
      >
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          rows={rows}
          placeholder={placeholder}
          className="resize-none outline-none bg-transparent w-full"
          style={{
            fontSize: 14,
            color: 'var(--text-default)',
            letterSpacing: '-0.005em',
            minHeight: 38,
            lineHeight: '20px',
          }}
          disabled={disabled}
          data-testid="chat-input"
        />
        <div
          className="flex items-center gap-1 pt-1"
          style={{ borderTop: '0.5px solid var(--hairline-soft)' }}
        >
          <IBtn onClick={onAttach} title="Attach file"><Paperclip size={13} strokeWidth={1.8} /></IBtn>
          <IBtn onClick={onMention} title="Reference a note"><AtSign size={13} strokeWidth={1.8} /></IBtn>
          <IBtn onClick={onSlashCommand} title="Slash commands"><Slash size={13} strokeWidth={1.8} /></IBtn>
          <button
            onClick={onModelClick}
            className="ml-1 px-2 py-0.5 rounded text-[11px] cursor-pointer flex items-center gap-1"
            style={{
              background: 'var(--bg-2)',
              color: 'var(--text-mid)',
              fontFamily: '-apple-system, ui-monospace, monospace',
            }}
            data-testid="chat-model-picker"
          >
            {modelName}
          </button>
          <button
            onClick={onSend}
            disabled={disabled || !value.trim()}
            className="ml-auto w-[30px] h-[26px] flex items-center justify-center rounded-md"
            style={{
              background: 'var(--accent)',
              color: 'white',
              boxShadow: '0 1px 2px rgba(0,0,0,0.12), inset 0 0.5px 0 rgba(255,255,255,0.25)',
              opacity: disabled || !value.trim() ? 0.5 : 1,
              cursor: disabled || !value.trim() ? 'default' : 'pointer',
            }}
            data-testid="chat-send"
          >
            <Send size={13} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <div
        className="mt-1.5 flex gap-2.5 flex-wrap"
        style={{ fontSize: 10.5, color: 'var(--text-faint)' }}
      >
        <span><Kbd>⌘↩</Kbd> Send</span>
        <span><Kbd>⇧↩</Kbd> Newline</span>
        <span><Kbd>@</Kbd> Ref</span>
        <span><Kbd>/</Kbd> Command</span>
        <span><Kbd>⌘\</Kbd> Focus mode</span>
      </div>
    </div>
  );
}

function IBtn({ onClick, children, title }: { onClick?: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-[26px] h-[26px] flex items-center justify-center rounded-md cursor-pointer"
      style={{ color: 'var(--text-mid)', background: 'transparent' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="px-1 rounded"
      style={{
        border: '0.5px solid var(--hairline)',
        background: 'var(--bg-2)',
        fontSize: 10,
        color: 'var(--text-mid)',
        fontFamily: '-apple-system, ui-monospace, monospace',
      }}
    >
      {children}
    </span>
  );
}
