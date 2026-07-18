import { Trash2, X } from 'lucide-react';

interface Props {
  count: number;
  onDelete: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function SelectionToolbar({ count, onDelete, onCancel, busy }: Props) {
  return (
    <div
      data-testid="selection-toolbar"
      className="absolute left-3 right-3 bottom-3 z-40 rounded-lg flex items-center gap-2 px-3 py-2 shadow-xl pane-fade-in"
      style={{
        background: 'rgba(20,25,40,0.96)',
        border: '1px solid var(--border-default)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <span className="text-[12px] font-medium" style={{ color: 'var(--text-high)' }}>
        {count} selected
      </span>
      <div className="flex-1" />
      <button
        onClick={onDelete}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-base disabled:opacity-50"
        style={{ color: '#ff7a8a', border: '1px solid var(--border-subtle)' }}
        aria-label={`Delete ${count} notes`}
      >
        <Trash2 size={11} strokeWidth={1.8} />
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      <button
        onClick={onCancel}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-base"
        style={{ color: 'var(--text-mid)' }}
        aria-label="Cancel selection"
      >
        <X size={11} strokeWidth={1.8} />
        Cancel
      </button>
    </div>
  );
}
