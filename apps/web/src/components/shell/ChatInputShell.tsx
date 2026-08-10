import { useRef, useEffect, useState } from 'react';
import { Paperclip, AtSign, Slash, Send, Check, Settings as SettingsIcon } from 'lucide-react';
import { SlashMenu, matchSlashCommands, type SlashCommand } from '../ops/SlashMenu';
import type { OpName } from '../ops/ops-types';
import { apiGet, apiPut } from '../../lib/api';
import { useSettings } from '../../store/settings';
import { showToast } from '../../store/toast';

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
  // Quick model switcher: click the model badge → pick any installed
  // local model. Cloud/provider changes still live in Settings.
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [localModels, setLocalModels] = useState<string[] | null>(null);
  const provider = useSettings((s) => s.provider);

  useEffect(() => {
    if (!modelMenuOpen) return;
    setLocalModels(null);
    apiGet<{ state: string; models: string[] }>('/ollama/status')
      .then((r) => setLocalModels(r.state === 'running' ? r.models : []))
      .catch(() => setLocalModels([]));
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('[data-model-menu]')) setModelMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [modelMenuOpen]);

  async function switchModel(model: string) {
    setModelMenuOpen(false);
    if (model === modelName && provider === 'ollama') return;
    try {
      const cfg = await apiGet<Record<string, unknown>>('/config');
      await apiPut('/config', { ...cfg, provider: 'ollama', model });
      useSettings.getState().setProvider('ollama');
      useSettings.getState().setModel(model);
      showToast(`Switched to ${model}`);
    } catch (e) {
      showToast(`Switch failed: ${(e as Error).message}`, 'error');
    }
  }

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
          <span className="relative ml-1" data-model-menu>
            <button
              onClick={() => (onModelClick ? onModelClick() : setModelMenuOpen((v) => !v))}
              className="px-2 py-0.5 rounded text-[11px] cursor-pointer flex items-center gap-1"
              style={{
                background: modelMenuOpen ? 'var(--row-hover)' : 'var(--bg-2)',
                color: 'var(--text-mid)',
                fontFamily: '-apple-system, ui-monospace, monospace',
              }}
              title="Switch model"
              data-testid="chat-model-picker"
            >
              {modelName}
            </button>
            {modelMenuOpen && (
              <div
                className="absolute left-0 overflow-hidden"
                style={{
                  bottom: '100%', marginBottom: 6, minWidth: 220,
                  background: 'var(--input-bg)', border: '0.5px solid var(--hairline)',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 40,
                }}
                data-testid="model-menu"
              >
                <div className="px-3 pt-2 pb-1" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Local models
                </div>
                {localModels === null && (
                  <div className="px-3 py-1.5" style={{ fontSize: 12, color: 'var(--text-faint)' }}>Loading…</div>
                )}
                {localModels?.length === 0 && (
                  <div className="px-3 py-1.5" style={{ fontSize: 12, color: 'var(--text-faint)' }}>Ollama isn't running</div>
                )}
                {localModels?.map((m) => {
                  const active = provider === 'ollama' && m === modelName;
                  return (
                    <button
                      key={m}
                      onClick={() => void switchModel(m)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer"
                      style={{ fontSize: 12, color: 'var(--text-default)', fontFamily: 'ui-monospace, monospace', background: 'transparent' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      data-testid={`model-option-${m}`}
                    >
                      <span className="w-3.5">{active && <Check size={12} strokeWidth={2.4} style={{ color: 'var(--accent)' }} />}</span>
                      {m}
                    </button>
                  );
                })}
                <div style={{ borderTop: '0.5px solid var(--hairline-soft)' }}>
                  <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    <SettingsIcon size={11} strokeWidth={1.8} /> Cloud models: Settings → Provider
                  </div>
                </div>
              </div>
            )}
          </span>
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
