import { useState, useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  currentSlug: string;
  onClose: () => void;
  onSubmit: (newSlug: string) => Promise<void>;
}

export function RenameNoteModal({ open, currentSlug, onClose, onSubmit }: Props) {
  const [value, setValue] = useState(currentSlug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(currentSlug);
    setError(null);
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(t);
  }, [open, currentSlug]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function normalize(v: string): string {
    return v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s_-]+/g, '-');
  }

  async function submit() {
    const next = normalize(value);
    if (!next) { setError('slug cannot be empty'); return; }
    if (next === currentSlug) { onClose(); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(next);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const normalized = normalize(value);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
      data-testid="rename-note-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl p-5"
        style={{ background: 'rgba(20,25,40,0.98)', border: '1px solid var(--border-default)', backdropFilter: 'blur(16px)' }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-high)' }}>Rename note</h2>
        <div className="text-[11px] mb-2" style={{ color: 'var(--text-mid)' }}>
          Current slug: <span className="font-mono">{currentSlug}</span>
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void submit(); }}
          className="w-full rounded-lg px-3 py-2 text-sm font-mono"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-high)' }}
          spellCheck={false}
        />
        {normalized !== value && (
          <div className="text-[10px] mt-2" style={{ color: 'var(--text-mid)' }}>
            Will be slugified to: <span className="font-mono">{normalized || '(empty)'}</span>
          </div>
        )}
        {error && (
          <div className="text-[11px] mt-2" style={{ color: 'var(--accent-rose, #ff7a8a)' }}>{error}</div>
        )}
        <div className="text-[10px] mt-3" style={{ color: 'var(--text-low)' }}>
          All [[wikilink]] references across your wiki will be auto-updated.
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-sm rounded transition-base" style={{ color: 'var(--text-mid)' }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !normalized}
            className="px-4 py-1.5 text-sm rounded transition-base font-medium"
            style={{ background: 'var(--accent-azure)', color: 'var(--text-inverse)', opacity: busy || !normalized ? 0.5 : 1 }}
          >
            {busy ? 'Renaming…' : 'Rename'}
          </button>
        </div>
      </div>
    </div>
  );
}
