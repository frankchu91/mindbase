interface ActionChipProps {
  kind: string;
  count?: number;
}

const COLOR: Record<string, string> = {
  propose_edit: '#60a5fa',
  create_concept: '#34d399',
  append_to_concept: '#34d399',
  link: '#fbbf24',
  flag_contradiction: '#ef4444',
  merge: '#a78bfa',
  skip: '#94a3b8',
};

export function ActionChip({ kind, count }: ActionChipProps) {
  const color = COLOR[kind] ?? '#94a3b8';
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 600,
      background: `${color}22`,
      color,
      border: `1px solid ${color}55`,
      marginRight: 4,
      whiteSpace: 'nowrap',
    }}>
      {kind}{count != null ? ` ×${count}` : ''}
    </span>
  );
}
