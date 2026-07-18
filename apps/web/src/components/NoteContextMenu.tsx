import { useEffect, useRef } from 'react';
import { Pencil, Copy, Link, Trash2 } from 'lucide-react';

interface Props {
  anchorRect: DOMRect;
  onClose: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}

export function NoteContextMenu({ anchorRect, onClose, onRename, onDuplicate, onCopyLink, onDelete }: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Position: below + right-aligned with the trigger
  const top = anchorRect.bottom + 4;
  const left = Math.max(8, anchorRect.right - 200); // 200 = menu width approx

  function item(Icon: typeof Pencil, label: string, action: () => void, danger?: boolean) {
    return (
      <button
        onClick={() => { onClose(); action(); }}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[12px] rounded transition-base"
        style={{ color: danger ? 'var(--accent-rose, #ff7a8a)' : 'var(--text-default)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Icon size={12} strokeWidth={1.8} />
        {label}
      </button>
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-lg shadow-xl py-1"
      style={{
        top, left, width: 200,
        background: 'var(--surface-elevated, var(--surface-1))',
        border: '1px solid var(--border-default)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {item(Pencil, 'Rename', onRename)}
      {item(Copy, 'Duplicate', onDuplicate)}
      {item(Link, 'Copy link', onCopyLink)}
      <div className="my-1 border-t" style={{ borderColor: 'var(--border-subtle)' }} />
      {item(Trash2, 'Move to Trash', onDelete, true)}
    </div>
  );
}
