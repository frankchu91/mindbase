interface StatusBarProps {
  notesCount: number | null;
  wikiCount: number | null;
  modelName: string;
  appVersion: string;
  lastSyncLabel?: string | null;
  dataPath?: string;
  onModelClick?: () => void;
  onVersionClick?: () => void;
  onSyncClick?: () => void;
}

export function StatusBar({
  notesCount,
  wikiCount,
  modelName,
  appVersion,
  lastSyncLabel,
  dataPath = '~/mindbase-data',
  onModelClick,
  onVersionClick,
  onSyncClick,
}: StatusBarProps) {
  const sep = <span className="opacity-50">·</span>;
  return (
    <div
      data-testid="status-bar"
      className="h-6 flex items-center px-3.5 gap-3 select-none"
      style={{
        background: 'var(--statusbar-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '0.5px solid var(--hairline)',
        fontSize: '10.5px',
        color: 'var(--text-faint)',
        fontFamily: '-apple-system, ui-monospace, monospace',
      }}
    >
      <span>{dataPath}</span>
      {sep}
      <span>{notesCount ?? '—'} notes</span>
      {sep}
      <span>{wikiCount ?? '—'} wiki</span>
      {lastSyncLabel && (
        <>
          {sep}
          <span
            className="cursor-pointer hover:opacity-100"
            onClick={onSyncClick}
            style={{ color: 'var(--text-faint)' }}
          >
            last sync {lastSyncLabel}
          </span>
        </>
      )}
      <span className="ml-auto flex gap-3">
        <span className="cursor-pointer hover:opacity-100" onClick={onModelClick}>
          {modelName}
        </span>
        <span className="opacity-50">·</span>
        <span className="cursor-pointer hover:opacity-100" onClick={onVersionClick}>
          {appVersion}
        </span>
      </span>
    </div>
  );
}
