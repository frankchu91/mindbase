import type { Dispatch, SetStateAction } from 'react';

export type EditorMode = 'preview' | 'source';

interface Props {
  mode: EditorMode;
  saving: boolean;
  savedAt: Date | null;
  error: string | null;
  aiInProgress: boolean;
  tick: number; // increment every second to refresh "Xs ago" display
  onModeChange: Dispatch<SetStateAction<EditorMode>>;
  onSave: () => void;
  onDone: () => void;
  onCancel: () => void;
  onDismissError: () => void;
}

export function EditorToolbar({
  mode,
  saving,
  savedAt,
  error,
  aiInProgress,
  tick,
  onModeChange,
  onSave,
  onDone,
  onCancel,
  onDismissError,
}: Props) {
  // Suppress lint warning — tick is used to force re-render on the status label
  void tick;
  const ago = savedAt ? Math.round((Date.now() - savedAt.getTime()) / 1000) : null;

  const statusText = saving
    ? 'Saving…'
    : error
      ? null
      : savedAt
        ? `Saved ${ago === 0 ? 'just now' : `${ago}s ago`}`
        : 'type / for commands · [[ for wikilinks · ⌘S to save';

  return (
    <>
      {/* Main toolbar */}
      <div
        className="px-5 py-3 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}
      >
        <button
          onClick={onCancel}
          className="text-[13px] cursor-pointer"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', padding: 0 }}
        >
          Cancel
        </button>

        {/* Status */}
        <div className="flex-1 text-[12px]" style={{ color: 'var(--text-mid)' }}>
          {statusText}
        </div>

        {aiInProgress && (
          <div className="text-[11px]" style={{ color: 'var(--accent-amber)' }}>
            AI thinking…
          </div>
        )}

        {/* Mode toggle */}
        <div
          className="flex rounded overflow-hidden"
          style={{ border: '1px solid var(--border)', flexShrink: 0 }}
        >
          <button
            onClick={() => onModeChange('preview')}
            className="px-3 py-1 text-[12px] cursor-pointer"
            style={{
              background: mode === 'preview' ? 'var(--accent-azure)' : 'var(--surface-2)',
              color: mode === 'preview' ? 'white' : 'var(--text-muted)',
              border: 'none',
              borderRight: '1px solid var(--border)',
            }}
            title="Live Preview (⌘+/)"
          >
            👁 Preview
          </button>
          <button
            onClick={() => onModeChange('source')}
            className="px-3 py-1 text-[12px] cursor-pointer"
            style={{
              background: mode === 'source' ? 'var(--accent-azure)' : 'var(--surface-2)',
              color: mode === 'source' ? 'white' : 'var(--text-muted)',
              border: 'none',
            }}
            title="Source mode (⌘+/)"
          >
            &lt;/&gt; Source
          </button>
        </div>

        <button
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1 text-[12px] rounded cursor-pointer"
          style={{ background: 'var(--accent-azure)', color: 'white', border: 'none' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        <button
          onClick={onDone}
          className="px-3 py-1 text-[12px] rounded cursor-pointer"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-default)',
          }}
        >
          Done
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="px-5 py-2 text-[11px] flex items-center gap-2"
          style={{ background: 'var(--error-bg, #fef2f2)', color: 'var(--error, #dc2626)', flexShrink: 0 }}
        >
          <span>{error}</span>
          <button
            onClick={onDismissError}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
