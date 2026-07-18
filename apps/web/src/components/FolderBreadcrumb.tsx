import { useEffect, useState } from 'react';
import { Folder as FolderIcon, ChevronDown, Sparkles, Loader2 } from 'lucide-react';
import { useFolders } from '../store/folders';
import { setNoteFolder, classifyNoteApi } from '../lib/folders';
import { showToast } from '../store/toast';
import { apiGet } from '../lib/api';

interface NoteMetaShape {
  folder?: string | null;
  folder_set_by?: 'llm' | 'user';
  folder_reason?: string;
  folder_classified_at?: string;
}

interface Props {
  slug: string;
  /** Increments when the parent re-fetches the note (post-save) so we re-read meta */
  reloadKey?: number;
}

export function FolderBreadcrumb({ slug, reloadKey }: Props) {
  const folders = useFolders((s) => s.folders);
  const refetchFolders = useFolders((s) => s.refetch);
  const [meta, setMeta] = useState<NoteMetaShape | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);

  useEffect(() => {
    if (folders.length === 0) void refetchFolders();
  }, [folders.length, refetchFolders]);

  useEffect(() => {
    apiGet<{ meta: NoteMetaShape }>(`/wiki/notes/${encodeURIComponent(slug)}/meta`)
      .then((d) => setMeta(d.meta))
      .catch(() => setMeta({}));
  }, [slug, reloadKey]);

  const currentPath = meta?.folder ?? 'inbox';
  const currentFolder = folders.find((f) => f.path === currentPath);
  const segments = currentPath.split('/').map((seg, i, arr) => {
    const subPath = arr.slice(0, i + 1).join('/');
    return folders.find((f) => f.path === subPath)?.name ?? seg;
  });

  async function pickFolder(newPath: string) {
    setPickerOpen(false);
    try {
      await setNoteFolder(slug, newPath);
      setMeta((m) => ({ ...m, folder: newPath, folder_set_by: 'user', folder_reason: 'set by user' }));
    } catch (e) {
      showToast(`Move failed: ${(e as Error).message}`, 'error');
    }
  }

  async function reclassify() {
    if (reclassifying) return;
    setReclassifying(true);
    try {
      const result = await classifyNoteApi(slug);
      setMeta((m) => ({ ...m, folder: result.folder, folder_set_by: 'llm', folder_reason: result.reason }));
      const reasonPreview = result.reason.length > 100 ? result.reason.slice(0, 100) + '…' : result.reason;
      showToast(`Classified to ${result.folder} — ${reasonPreview}`, 'info');
    } catch (e) {
      showToast(`Reclassify failed: ${(e as Error).message}`, 'error');
    } finally {
      setReclassifying(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-[12px] px-4 py-1 relative" style={{ color: 'var(--text-mid)', borderBottom: '0.5px solid var(--hairline)' }}>
      <FolderIcon size={11} />
      <button
        onClick={() => setPickerOpen((p) => !p)}
        className="flex items-center gap-1 cursor-pointer"
        style={{ background: 'transparent', border: 'none', color: 'inherit', padding: 0 }}
        title={meta?.folder_reason ?? ''}
      >
        {segments.join(' / ')}
        <ChevronDown size={11} />
      </button>
      <button
        onClick={reclassify}
        disabled={reclassifying}
        title="Let AI pick the best folder for this note based on your folder structure and existing notes."
        className="flex items-center gap-1.5 cursor-pointer rounded px-2 py-0.5 text-[12px] font-medium"
        style={{
          background: reclassifying ? 'transparent' : 'var(--accent-soft, rgba(96,165,250,0.12))',
          color: 'var(--accent, #60a5fa)',
          border: '0.5px solid var(--accent, #60a5fa)',
          opacity: reclassifying ? 0.6 : 1,
        }}
      >
        {reclassifying ? (
          <>
            <Loader2 size={11} className="animate-spin" />
            <span>AI is classifying…</span>
          </>
        ) : (
          <>
            <Sparkles size={11} />
            <span>{meta?.folder_classified_at ? 'Reclassify with AI' : 'Classify with AI'}</span>
          </>
        )}
      </button>
      {meta?.folder_set_by === 'llm' && currentFolder && !reclassifying && (
        <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>· last set by AI</span>
      )}
      {meta?.folder_set_by === 'user' && !reclassifying && (
        <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>· locked (manual)</span>
      )}

      {pickerOpen && (
        <div className="absolute top-full left-4 z-50 mt-1 max-h-72 overflow-y-auto rounded shadow-lg" style={{ background: 'var(--bg-panel)', border: '0.5px solid var(--hairline)', minWidth: 200 }}>
          {folders.map((f) => (
            <div
              key={f.path}
              onClick={() => pickFolder(f.path)}
              className="px-3 py-1.5 cursor-pointer hover:bg-[var(--row-hover)] text-[12px]"
              style={{ color: f.path === currentPath ? 'var(--accent)' : 'var(--text-default)' }}
            >
              {f.path === currentPath && '✓ '}{f.name}
              <span className="ml-2 text-[10px]" style={{ color: 'var(--text-faint)' }}>{f.path}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
