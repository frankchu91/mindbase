// apps/web/src/components/AddEntryModal.tsx
import { useState, useEffect, useRef } from 'react';
import { showToast } from '../store/toast';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

function getUsername(): string {
  return localStorage.getItem('mindbase-username') ?? '';
}

export function AddEntryModal({ open, onClose, onDone }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setTimeout(() => taRef.current?.focus(), 50);
    }
  }, [open]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/tree/contributors/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mindbase-user': getUsername() },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('Added to today');
      onDone();
      onClose();
    } catch (e) {
      showToast(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, text, busy]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#1a1a1a', color: '#e5e5e5', borderRadius: 10, width: 380, padding: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Add to today</h3>
          <span style={{ background: '#333', color: '#999', padding: '2px 6px', borderRadius: 3, fontSize: 10, fontFamily: 'monospace' }}>⌘↵</span>
        </div>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What did you decide, learn, or notice?"
          style={{ width: '100%', minHeight: 100, background: '#111', color: '#ddd', border: '1px solid #333', borderRadius: 6, padding: 12, resize: 'vertical', fontFamily: 'system-ui', fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ background: '#333', color: '#ccc', border: '1px solid #444', borderRadius: 5, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !text.trim()}
            style={{ background: busy || !text.trim() ? '#333' : '#4a4a8a', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 14px', cursor: busy || !text.trim() ? 'not-allowed' : 'pointer', fontSize: 12 }}
          >
            {busy ? 'Adding…' : 'Add (⌘↵)'}
          </button>
        </div>
      </div>
    </div>
  );
}
