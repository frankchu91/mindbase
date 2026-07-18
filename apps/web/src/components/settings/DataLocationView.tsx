import { useEffect, useState } from 'react';
import { HardDrive, FolderOpen, Save, AlertCircle } from 'lucide-react';

interface DataDirInfo {
  current: string;
  source: 'env' | 'prefs' | 'default';
  envOverride: boolean;
  prefsPath: string;
  pendingRestart: boolean;
}

const SOURCE_LABEL: Record<DataDirInfo['source'], string> = {
  env: 'env var',
  prefs: 'settings file',
  default: 'default',
};

export function DataLocationView() {
  const [info, setInfo] = useState<DataDirInfo | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function load(): Promise<void> {
    setErr(null);
    try {
      const r = await fetch('/api/server/data-dir');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as DataDirInfo;
      setInfo(d);
      if (!draft) setDraft(d.current);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(): Promise<void> {
    setErr(null);
    setSaving(true);
    try {
      const r = await fetch('/api/server/data-dir', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dataDir: draft.trim() }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
      }
      setSavedAt(Date.now());
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="data-location-view">
      <div className="px-8 py-6 max-w-[820px] mx-auto w-full">
        <div className="flex items-start gap-3 mb-1">
          <div className="shrink-0 pt-1">
            <HardDrive size={20} style={{ color: 'var(--text-mid)' }} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--text-high)' }}>
              Data location
            </h2>
            <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-mid)' }}>
              The directory MindBase reads and writes — projects, raw sources, wiki pages,
              chats, embeddings. The same directory works as a wiki for the Claude Code skill
              (use <code style={{ color: 'var(--text-default)' }}>--wiki-path</code> there to
              point at it from the terminal).
            </p>
          </div>
        </div>

        {info && (
          <>
            <div
              className="mt-6 p-4 rounded"
              style={{ background: 'var(--bg-2)', border: '0.5px solid var(--hairline)' }}
            >
              <div className="text-[10.5px] uppercase tracking-[2px] font-semibold mb-1.5"
                   style={{ color: 'var(--text-mid)' }}>
                Current ({SOURCE_LABEL[info.source]})
              </div>
              <div className="font-mono text-[13px] break-all" style={{ color: 'var(--text-high)' }}>
                {info.current}
              </div>
              {info.envOverride && (
                <div
                  className="mt-3 flex items-start gap-2 text-[11.5px]"
                  style={{ color: 'var(--text-mid)' }}
                >
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <div>
                    <code style={{ color: 'var(--text-default)' }}>MINDBASE_DATA_DIR</code> env
                    var is set — this takes precedence over UI changes. Unset it (and restart) to
                    use the value below.
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6">
              <label className="block text-[10.5px] uppercase tracking-[2px] font-semibold mb-2"
                     style={{ color: 'var(--text-mid)' }}>
                Set data directory
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="/Users/you/mindbase or ~/mindbase"
                  spellCheck={false}
                  disabled={info.envOverride || saving}
                  className="flex-1 px-3 py-2 rounded outline-none font-mono text-[12.5px]"
                  style={{
                    background: 'var(--bg-2)',
                    border: '0.5px solid var(--hairline)',
                    color: 'var(--text-default)',
                  }}
                />
                <button
                  onClick={() => void save()}
                  disabled={info.envOverride || saving || draft.trim().length === 0 || draft.trim() === info.current}
                  className="inline-flex items-center gap-1.5 px-3 text-[12px] rounded cursor-pointer disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  <Save size={13} /> {saving ? 'Saving…' : 'Apply'}
                </button>
              </div>
              <div className="mt-2 text-[11.5px]" style={{ color: 'var(--text-mid)' }}>
                Use an absolute path or one starting with <code style={{ color: 'var(--text-default)' }}>~/</code>.
                The directory will be created if it doesn't exist (parent must exist and be writable).
              </div>
            </div>

            {info.pendingRestart && (
              <div
                className="mt-6 p-3 rounded flex items-start gap-2"
                style={{
                  background: 'var(--bg-2)',
                  border: '0.5px solid var(--accent-amber, var(--hairline))',
                }}
              >
                <AlertCircle size={14} className="shrink-0 mt-0.5"
                             style={{ color: 'var(--accent-amber, var(--text-mid))' }} />
                <div className="text-[12px]" style={{ color: 'var(--text-default)' }}>
                  <strong>Restart required.</strong> The saved location won't take effect until the
                  server is restarted. In dev: kill the <code>pnpm dev</code> process and rerun it.
                </div>
              </div>
            )}

            <div className="mt-4 text-[11px]" style={{ color: 'var(--text-mid)' }}>
              Settings file: <code style={{ color: 'var(--text-default)' }}>{info.prefsPath}</code>
            </div>

            <div className="mt-6 p-4 rounded text-[12px]" style={{
              background: 'var(--bg-2)',
              border: '0.5px solid var(--hairline)',
              color: 'var(--text-mid)',
            }}>
              <div className="font-semibold mb-1.5" style={{ color: 'var(--text-high)' }}>
                <FolderOpen size={12} className="inline mr-1" />
                Using this from the terminal
              </div>
              In a Claude Code conversation:
              <pre className="mt-2 p-2 rounded font-mono text-[11.5px]" style={{
                background: 'var(--bg-3)', color: 'var(--text-default)',
              }}>{`/mb-ingest paper.pdf --wiki-path ${info.current}`}</pre>
              Or <code style={{ color: 'var(--text-default)' }}>cd</code> into that directory and
              omit the flag — the skill walks up looking for <code>wiki/</code>.
            </div>
          </>
        )}

        <div className="mt-6 h-5 text-[11.5px]" style={{ color: err ? 'var(--error)' : 'var(--text-mid)' }}>
          {err ?? (savedAt ? 'Saved' : '')}
        </div>
      </div>
    </div>
  );
}
