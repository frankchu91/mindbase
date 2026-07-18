import { useState, useEffect, useRef } from 'react';
import {
  Folder, FileText, Sheet, Presentation, File as FileIcon,
  Loader2, CheckCircle2, AlertCircle, XCircle, MinusCircle,
  type LucideIcon,
} from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { showToast } from '../store/toast';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  isFolder: boolean;
}

type ImportStatus = 'queued' | 'downloading' | 'ingesting' | 'compiling' | 'done' | 'skipped' | 'error' | 'cancelled';

interface FileProgress {
  id: string;
  name: string;
  status: ImportStatus;
  reason?: string;
}

interface Props {
  onClose: () => void;
  onImportStarted: () => void;
}

const SUPPORTED_FILE_MIMES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MIME_ICONS: Record<string, LucideIcon> = {
  'application/vnd.google-apps.folder': Folder,
  'application/vnd.google-apps.document': FileText,
  'application/vnd.google-apps.spreadsheet': Sheet,
  'application/vnd.google-apps.presentation': Presentation,
  'application/pdf': FileText,
  'text/plain': FileText,
  'text/markdown': FileText,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText,
};

const MAX_FILES = 500;
const MAX_DEPTH = 10;

function statusColor(s: ImportStatus): string {
  switch (s) {
    case 'done': return 'var(--accent-azure)';
    case 'error': return 'var(--accent-rose, #ff7a8a)';
    case 'skipped': return 'var(--text-mid)';
    case 'cancelled': return 'var(--text-low)';
    default: return 'var(--text-default)';
  }
}

function StatusPill({ status }: { status: ImportStatus }) {
  const inFlight = status === 'downloading' || status === 'ingesting' || status === 'compiling';
  const Icon =
    status === 'done' ? CheckCircle2 :
    status === 'error' ? XCircle :
    status === 'skipped' ? MinusCircle :
    status === 'cancelled' ? AlertCircle :
    Loader2;
  return (
    <div className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: statusColor(status) }}>
      <Icon size={11} strokeWidth={1.8} className={inFlight ? 'animate-spin' : ''} />
      {status}
    </div>
  );
}

export function DrivePickerModal({ onClose, onImportStarted }: Props) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([{ id: 'root', name: 'My Drive' }]);
  const [selectedFiles, setSelectedFiles] = useState<Map<string, { id: string; name: string; mimeType: string }>>(new Map());
  const [selectedFolders, setSelectedFolders] = useState<Map<string, { id: string; name: string }>>(new Map());
  const [importing, setImporting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [progress, setProgress] = useState<Map<string, FileProgress>>(new Map());
  const [completed, setCompleted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const currentFolder = folderStack[folderStack.length - 1]!;

  useEffect(() => {
    void loadFiles(currentFolder.id);
  }, [currentFolder.id]);

  // Lock Esc during import / discovery
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !importing && !discovering) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [importing, discovering, onClose]);

  async function loadFiles(folderId: string) {
    setLoading(true);
    try {
      const r = await apiGet<{ files: DriveFile[] }>(`/google/files?folderId=${folderId}`);
      setFiles(r.files);
    } catch {
      setFiles([]);
    }
    setLoading(false);
  }

  function openFolder(folder: DriveFile) {
    setFolderStack([...folderStack, { id: folder.id, name: folder.name }]);
  }

  function goBack() {
    if (folderStack.length <= 1) return;
    setFolderStack(folderStack.slice(0, -1));
  }

  function toggleFile(file: DriveFile) {
    const next = new Map(selectedFiles);
    if (next.has(file.id)) next.delete(file.id);
    else next.set(file.id, { id: file.id, name: file.name, mimeType: file.mimeType });
    setSelectedFiles(next);
  }

  function toggleFolder(folder: DriveFile) {
    const next = new Map(selectedFolders);
    if (next.has(folder.id)) next.delete(folder.id);
    else next.set(folder.id, { id: folder.id, name: folder.name });
    setSelectedFolders(next);
  }

  function selectAllInFolder() {
    const next = new Map(selectedFiles);
    for (const f of files) {
      if (f.isFolder) continue;
      if (!SUPPORTED_FILE_MIMES.has(f.mimeType)) continue;
      next.set(f.id, { id: f.id, name: f.name, mimeType: f.mimeType });
    }
    setSelectedFiles(next);
  }

  async function setSyncFolder() {
    try {
      await apiPost('/google/set-sync-folder', { folderId: currentFolder.id, folderName: currentFolder.name });
      showToast(`Sync folder set to "${currentFolder.name}"`, 'info');
    } catch (e) {
      showToast(`Failed: ${(e as Error).message}`, 'error');
    }
  }

  async function discoverFolderFiles(
    folderId: string,
    depth: number,
    acc: Map<string, { id: string; name: string; mimeType: string }>,
  ): Promise<void> {
    if (depth > MAX_DEPTH) return;
    if (acc.size > MAX_FILES) return;
    let listing: DriveFile[] = [];
    try {
      const r = await apiGet<{ files: DriveFile[] }>(`/google/files?folderId=${folderId}`);
      listing = r.files;
    } catch {
      return;
    }
    for (const f of listing) {
      if (acc.size > MAX_FILES) return;
      if (f.isFolder) {
        await discoverFolderFiles(f.id, depth + 1, acc);
      } else if (SUPPORTED_FILE_MIMES.has(f.mimeType)) {
        if (!acc.has(f.id)) {
          acc.set(f.id, { id: f.id, name: f.name, mimeType: f.mimeType });
          setDiscoveredCount(acc.size);
        }
      }
    }
  }

  async function startImport() {
    if (selectedFiles.size === 0 && selectedFolders.size === 0) return;

    // 1. Discover files inside selected folders (if any)
    const allFiles = new Map(selectedFiles);
    if (selectedFolders.size > 0) {
      setDiscovering(true);
      setDiscoveredCount(allFiles.size);
      try {
        for (const folder of selectedFolders.values()) {
          if (allFiles.size > MAX_FILES) break;
          await discoverFolderFiles(folder.id, 0, allFiles);
        }
      } catch (e) {
        showToast(`Discovery failed: ${(e as Error).message}`, 'error');
        setDiscovering(false);
        return;
      }
      setDiscovering(false);
      if (allFiles.size > MAX_FILES) {
        showToast(`Too many files (${allFiles.size} > ${MAX_FILES}). Narrow your selection.`, 'error');
        return;
      }
      if (allFiles.size === 0) {
        showToast('No supported files found in selected folders.', 'error');
        return;
      }
    }

    // 2. Initialize progress board
    const initial = new Map<string, FileProgress>();
    for (const f of allFiles.values()) initial.set(f.id, { id: f.id, name: f.name, status: 'queued' });
    setProgress(initial);
    setImporting(true);
    setCompleted(false);

    // 3. Build name→id lookup (server emits filename, not id)
    const nameToId = new Map<string, string>();
    for (const f of allFiles.values()) nameToId.set(f.name, f.id);

    // 4. Stream import
    abortRef.current = new AbortController();
    try {
      const response = await fetch('/api/google/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileIds: Array.from(allFiles.values()) }),
        signal: abortRef.current.signal,
      });
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          try {
            const event = JSON.parse(trimmed.slice(5).trim()) as {
              kind: 'progress' | 'done' | 'error';
              file?: string;
              status?: ImportStatus;
              reason?: string;
              error?: string;
            };
            if (event.kind === 'progress' && event.file && event.status) {
              const fileId = nameToId.get(event.file);
              if (!fileId) continue;
              const status = event.status;
              const reason = event.reason ?? event.error;
              setProgress((prev) => {
                const next = new Map(prev);
                const cur = next.get(fileId);
                if (cur) next.set(fileId, { ...cur, status, reason });
                return next;
              });
            }
            if (event.kind === 'done') {
              setCompleted(true);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setProgress((prev) => {
          const next = new Map(prev);
          for (const [id, p] of next.entries()) {
            if (p.status === 'queued' || p.status === 'downloading' || p.status === 'ingesting' || p.status === 'compiling') {
              next.set(id, { ...p, status: 'cancelled' });
            }
          }
          return next;
        });
      } else {
        showToast(`Import error: ${(e as Error).message}`, 'error');
      }
    }
    setImporting(false);
    setCompleted(true);
    onImportStarted(); // refresh wiki list in parent
  }

  function cancelImport() {
    if (!importing) return;
    abortRef.current?.abort();
  }

  function handleBackdropClick() {
    if (importing || discovering) return; // locked
    onClose();
  }

  const totalSelected = selectedFiles.size + selectedFolders.size;
  const progressArr = Array.from(progress.values());
  const doneCount = progressArr.filter((p) => p.status === 'done' || p.status === 'skipped').length;
  const errorCount = progressArr.filter((p) => p.status === 'error' || p.status === 'cancelled').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(5,11,26,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={handleBackdropClick}
      data-testid="drive-picker-modal"
    >
      <div
        className="w-full max-w-lg rounded-[14px] overflow-hidden flex flex-col glass-card"
        style={{ background: 'var(--surface-0)', backdropFilter: 'blur(40px) saturate(180%)', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          {!importing && !discovering ? (
            <>
              <div className="flex items-center gap-2">
                {folderStack.length > 1 && (
                  <button onClick={goBack} className="text-sm" style={{ color: 'var(--accent)' }}>←</button>
                )}
                <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Folder size={14} strokeWidth={1.6} />
                  {currentFolder.name}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {currentFolder.id !== 'root' && (
                  <button
                    onClick={setSyncFolder}
                    className="text-[10px] px-2 py-1 rounded"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                  >
                    Set as sync folder
                  </button>
                )}
                <button onClick={onClose} className="text-sm" style={{ color: 'var(--text-muted)' }} aria-label="close">✕</button>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {discovering
                  ? `Discovering files… (${discoveredCount})`
                  : completed
                    ? 'Import complete'
                    : `Importing… ${doneCount} of ${progressArr.length}`}
              </div>
              {importing ? (
                <button
                  onClick={cancelImport}
                  className="text-[11px] px-2 py-1 rounded"
                  style={{ color: 'var(--accent-rose, #ff7a8a)', border: '1px solid var(--border)' }}
                >
                  Cancel
                </button>
              ) : completed ? (
                <button
                  onClick={onClose}
                  className="text-[11px] px-3 py-1 rounded font-medium"
                  style={{ background: 'var(--accent-azure)', color: 'var(--text-inverse)' }}
                >
                  Close
                </button>
              ) : null}
            </>
          )}
        </div>

        {/* File list (only when not importing/discovering) */}
        {!importing && !discovering && (
          <>
            <div
              className="px-3 py-1.5 flex items-center justify-between text-[10px]"
              style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-mid)' }}
            >
              <button onClick={selectAllInFolder} className="hover:underline" style={{ color: 'var(--text-mid)' }}>
                Select all supported in this folder
              </button>
              <span>Tick folders to import recursively</span>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {loading ? (
                <div className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</div>
              ) : files.length === 0 ? (
                <div className="text-center py-8 text-xs" style={{ color: 'var(--text-faint)' }}>Empty folder</div>
              ) : (
                files.map((f) => {
                  const isSelected = f.isFolder ? selectedFolders.has(f.id) : selectedFiles.has(f.id);
                  const supported = f.isFolder || SUPPORTED_FILE_MIMES.has(f.mimeType);
                  return (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
                      style={{ background: isSelected ? 'var(--bg-active)' : 'transparent' }}
                      onClick={() => f.isFolder ? openFolder(f) : (supported && toggleFile(f))}
                      onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = 'transparent')}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!supported}
                        onChange={() => f.isFolder ? toggleFolder(f) : toggleFile(f)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 accent-blue-500 shrink-0 disabled:opacity-30"
                      />
                      {(() => {
                        const Icon = MIME_ICONS[f.mimeType] ?? FileIcon;
                        return <Icon size={14} strokeWidth={1.6} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} />;
                      })()}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{f.name}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                          {new Date(f.modifiedTime).toLocaleDateString()}
                          {!supported && !f.isFolder && ' · unsupported'}
                        </div>
                      </div>
                      {f.isFolder && <span className="text-xs" style={{ color: 'var(--text-faint)' }}>→</span>}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Discovering banner */}
        {discovering && (
          <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--text-mid)' }}>
            <Loader2 size={14} strokeWidth={1.8} className="animate-spin mr-2" />
            Discovered {discoveredCount} files…
          </div>
        )}

        {/* Progress board (during/after import) */}
        {(importing || completed) && progressArr.length > 0 && (
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <div className="mb-3">
              <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: 'var(--text-mid)' }}>
                <span>{doneCount} done · {errorCount} errors · {progressArr.length} total</span>
                <span>{Math.round((doneCount / Math.max(progressArr.length, 1)) * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${(doneCount / Math.max(progressArr.length, 1)) * 100}%`,
                    background: 'var(--accent-azure)',
                  }}
                />
              </div>
            </div>
            {progressArr.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-2 py-1.5 px-2 rounded">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] truncate" style={{ color: 'var(--text-default)' }}>{p.name}</div>
                  {p.reason && (
                    <div className="text-[10px] truncate" style={{ color: 'var(--text-low)' }}>{p.reason}</div>
                  )}
                </div>
                <StatusPill status={p.status} />
              </div>
            ))}
          </div>
        )}

        {/* Footer — selection summary + Import button (only when picking) */}
        {!importing && !discovering && !completed && (
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''}
              {selectedFolders.size > 0 && ` · ${selectedFolders.size} folder${selectedFolders.size !== 1 ? 's' : ''} (recursive)`}
            </div>
            <button
              onClick={() => void startImport()}
              disabled={totalSelected === 0}
              className="px-4 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
              style={{ background: 'var(--bg-bubble-user)', color: 'var(--text-inverse)' }}
            >
              Import Selected
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
