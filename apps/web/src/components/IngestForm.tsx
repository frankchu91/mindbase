import { useState, useRef, useEffect } from 'react';
import { Folder } from 'lucide-react';
import { apiPost, apiPostFile } from '../lib/api';
import { useSettings } from '../store/settings';
import { DrivePickerModal } from './DrivePickerModal';

interface Props {
  onBack: () => void;
  onIngested: () => void;
}

interface IngestStatus {
  kind: 'idle' | 'busy' | 'success' | 'error';
  message?: string;
}

export function IngestForm({ onBack, onIngested }: Props) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<IngestStatus>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { googleConnected, checkGoogleStatus } = useSettings();
  const [showDrivePicker, setShowDrivePicker] = useState(false);

  useEffect(() => { checkGoogleStatus(); }, []);

  async function handleSubmit() {
    const body = text.trim();
    if (!body) return;
    setStatus({ kind: 'busy', message: 'Saving and compiling...' });
    try {
      const { rawId } = await apiPost<{ rawId: string }>('/ingest/text', { text: body, title: title.trim() || undefined });
      const r = await apiPost<{ ok: boolean; error?: string }>(`/compile/${rawId}`, {});
      if (!r.ok) throw new Error(r.error ?? 'compile failed');
      setStatus({ kind: 'success', message: 'Ingested and compiled' });
      setText('');
      setTitle('');
      onIngested();
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  }

  async function handleFile(file: File) {
    const isImage = file.type.startsWith('image/');
    setStatus({ kind: 'busy', message: `${isImage ? 'Analyzing' : 'Uploading'} ${file.name}...` });
    try {
      const endpoint = isImage ? '/ingest/image' : '/ingest/file';
      const { rawId } = await apiPostFile<{ rawId: string }>(endpoint, file);
      const r = await apiPost<{ ok: boolean; error?: string }>(`/compile/${rawId}`, {});
      if (!r.ok) throw new Error(r.error ?? 'compile failed');
      setStatus({ kind: 'success', message: `${file.name} ingested` });
      onIngested();
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-sidebar)' }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={onBack} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>←</button>
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Ingest Content</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Title (optional)</div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give it a name..."
            className="w-full rounded-[10px] px-3 py-2.5 text-[12px] outline-none glass-card"
            style={{ color: 'var(--text-default)' }}
            disabled={status.kind === 'busy'}
          />
        </div>
        <div className="flex-1 flex flex-col">
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Content</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste text, URL, YouTube link, or article content..."
            className="flex-1 min-h-[120px] w-full rounded-[10px] px-3 py-2.5 text-[12px] font-mono outline-none resize-none glass-card"
            style={{ color: 'var(--text-default)' }}
            disabled={status.kind === 'busy'}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={status.kind === 'busy' || !text.trim()}
            className="flex-1 py-2.5 rounded-[10px] text-[12px] font-semibold disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--text-inverse)' }}
          >
            {status.kind === 'busy' ? 'Compiling…' : 'Save & Compile'}
          </button>
          <label
            className="py-2 px-3 rounded-lg text-xs cursor-pointer flex items-center gap-1"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            📎 Upload
            <input ref={fileRef} type="file" accept=".md,.txt,.pdf,.png,.jpg,.jpeg,.gif,.webp" onChange={handleFilePick} className="hidden" disabled={status.kind === 'busy'} />
          </label>
        </div>

        <div
          className="text-center text-[10.5px] py-4 rounded-[10px] transition-colors"
          style={{
            border: `1px dashed ${dragging ? 'var(--accent-azure)' : 'var(--border-default)'}`,
            color: dragging ? 'var(--accent-azure)' : 'var(--text-low)',
            background: dragging ? 'var(--surface-2)' : 'transparent',
          }}
        >
          or drag &amp; drop a file here
        </div>

        {/* Google Drive */}
        <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          {googleConnected ? (
            <button
              onClick={() => setShowDrivePicker(true)}
              disabled={status.kind === 'busy'}
              className="w-full py-2 rounded-lg text-xs font-medium disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              <Folder size={14} strokeWidth={1.6} />
              Import from Google Drive
            </button>
          ) : (
            <button
              onClick={() => {
                // Open server redirect synchronously (preserves user-gesture; no popup blocker)
                window.open('/api/google/auth/start', '_blank', 'width=500,height=600');
                // Poll for connection status
                const interval = setInterval(async () => {
                  await checkGoogleStatus();
                  if (useSettings.getState().googleConnected) clearInterval(interval);
                }, 2000);
                setTimeout(() => clearInterval(interval), 120000);
              }}
              className="w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              🔗 Connect Google Drive
            </button>
          )}
        </div>

        {showDrivePicker && (
          <DrivePickerModal
            onClose={() => setShowDrivePicker(false)}
            onImportStarted={() => { setShowDrivePicker(false); onIngested(); }}
          />
        )}

        {status.kind !== 'idle' && status.message && (
          <div
            className="text-xs px-3 py-2 rounded-lg"
            style={{
              background: status.kind === 'success' ? 'var(--success-bg)' : status.kind === 'error' ? 'var(--error-bg)' : 'var(--bg-hover)',
              color: status.kind === 'success' ? 'var(--success)' : status.kind === 'error' ? 'var(--error)' : 'var(--text-secondary)',
            }}
          >
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}
