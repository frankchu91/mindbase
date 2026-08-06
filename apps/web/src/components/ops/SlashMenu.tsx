import type { OpName } from './ops-types';

export interface SlashCommand {
  name: string;
  hint: string;
  op: OpName | null; // null → coming soon, not selectable
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'contribute', hint: 'process a thought/source into the wiki', op: 'contribute' },
  { name: 'build', hint: 'rebuild context.md from unbuilt sources', op: 'build' },
  { name: 'lint', hint: 'wiki health check — coming soon', op: null },
  { name: 'research', hint: 'research a question — coming soon', op: null },
];

/** Commands matching the composer text, which must start with '/'. */
export function matchSlashCommands(value: string): SlashCommand[] {
  if (!value.startsWith('/')) return [];
  const typed = value.slice(1);
  // Once a full command + space is typed the user is writing the argument.
  if (typed.includes(' ')) return [];
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(typed.toLowerCase()));
}

interface SlashMenuProps {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
}

export function SlashMenu({ commands, activeIndex, onSelect, onHover }: SlashMenuProps) {
  return (
    <div
      className="absolute left-4 right-4 overflow-hidden"
      style={{
        bottom: '100%',
        marginBottom: 6,
        background: 'var(--input-bg)',
        border: '0.5px solid var(--hairline)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        zIndex: 40,
      }}
      data-testid="slash-menu"
    >
      {commands.map((c, i) => (
        <button
          key={c.name}
          disabled={!c.op}
          onClick={() => c.op && onSelect(c)}
          onMouseEnter={() => c.op && onHover(i)}
          className="w-full flex items-baseline gap-2 px-3 py-2 text-left"
          style={{
            background: i === activeIndex && c.op ? 'var(--row-hover)' : 'transparent',
            cursor: c.op ? 'pointer' : 'default',
            opacity: c.op ? 1 : 0.45,
          }}
          data-testid={`slash-cmd-${c.name}`}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-default)', fontFamily: 'ui-monospace, monospace' }}>
            /{c.name}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{c.hint}</span>
        </button>
      ))}
    </div>
  );
}
