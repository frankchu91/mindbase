import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { listSchemaFiles, getSchemaFile, putSchemaFile, resetSchemaFile, type SchemaFileEntry } from '../lib/synthesis';
import { showToast } from '../store/toast';

const DESCRIPTIONS: Record<string, string> = {
  'ingest.md': 'Instructions the LLM follows when ingesting a new source document.',
  'query.md': 'Instructions used when the chat panel queries the wiki.',
  'lint.md': 'Instructions for L2 lint passes (health checks, cross-linking).',
  'synthesis.md': 'Preamble prepended to Active Wiki engine prompts (synthesis, network, curation).',
  'conventions.md': 'General wiki conventions referenced by other prompts.',
};

export function SchemaSettings() {
  const [files, setFiles] = useState<SchemaFileEntry[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = content !== original;

  const refresh = useCallback(async () => {
    const list = await listSchemaFiles();
    setFiles(list);
    if (!active && list.length > 0) setActive(list[0]!.file);
  }, [active]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getSchemaFile(active).then((c) => {
      if (cancelled) return;
      setContent(c); setOriginal(c);
    }).catch((e) => showToast(`Load failed: ${(e as Error).message}`, 'error'));
    return () => { cancelled = true; };
  }, [active]);

  async function save() {
    if (!active) return;
    setSaving(true);
    try {
      await putSchemaFile(active, content);
      setOriginal(content);
      await refresh();
      showToast('Saved', 'info');
    } catch (e) {
      showToast(`Save failed: ${(e as Error).message}`, 'error');
    } finally { setSaving(false); }
  }

  async function reset() {
    if (!active) return;
    if (!window.confirm(`Reset ${active} to default? Your edits will be lost.`)) return;
    try {
      await resetSchemaFile(active);
      const c = await getSchemaFile(active);
      setContent(c); setOriginal(c);
      await refresh();
      showToast('Reset to default', 'info');
    } catch (e) { showToast(`Reset failed: ${(e as Error).message}`, 'error'); }
  }

  return (
    <div className="flex h-full" data-testid="schema-settings">
      <div className="w-[200px] shrink-0 p-3 overflow-y-auto" style={{ borderRight: '1px solid var(--border-subtle)' }}>
        <div className="text-[10.5px] uppercase tracking-[2px] font-semibold mb-2" style={{ color: 'var(--text-mid)' }}>
          Wiki Schema
        </div>
        {files.map((f) => (
          <button
            key={f.file}
            onClick={() => setActive(f.file)}
            className="block w-full text-left text-[12px] py-1.5 px-2 rounded transition-base mb-0.5"
            style={{
              background: active === f.file ? 'var(--surface-2)' : 'transparent',
              color: active === f.file ? 'var(--text-high)' : 'var(--text-default)',
            }}
          >
            {f.file}
            {f.modified && <span className="ml-1 text-[9px]" style={{ color: 'var(--accent-amber)' }}>● modified</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col p-4 min-w-0">
        {active && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="font-semibold text-sm" style={{ color: 'var(--text-high)' }}>{active}</div>
              <div className="text-[11px] flex-1" style={{ color: 'var(--text-mid)' }}>
                {DESCRIPTIONS[active] ?? ''}
              </div>
              <button
                onClick={reset}
                className="text-[11px] px-2 py-1 rounded inline-flex items-center gap-1 transition-base"
                style={{ color: 'var(--text-mid)', border: '1px solid var(--border-subtle)' }}
              >
                <RotateCcw size={11} /> Reset
              </button>
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="text-[11px] px-2 py-1 rounded inline-flex items-center gap-1 transition-base font-medium"
                style={{
                  background: dirty ? 'var(--accent-azure)' : 'var(--surface-2)',
                  color: dirty ? 'var(--text-inverse)' : 'var(--text-mid)',
                  opacity: !dirty || saving ? 0.5 : 1,
                }}
              >
                <Save size={11} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 w-full p-3 rounded text-[12px] outline-none resize-none font-mono"
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-default)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
              spellCheck={false}
            />
          </>
        )}
      </div>
    </div>
  );
}
