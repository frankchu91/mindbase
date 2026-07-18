// apps/web/src/components/settings/SchemaEditor.tsx
import { useEffect, useState } from 'react';
import { Save, RotateCcw } from 'lucide-react';

export function SchemaEditor() {
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/project/schema');
        const d = (await r.json()) as { content: string };
        setContent(d.content);
        setOriginal(d.content);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(): Promise<void> {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch('/api/project/schema', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error ?? `HTTP ${r.status}`);
      }
      setOriginal(content);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = content !== original;

  return (
    <div className="flex flex-col h-full p-6 max-w-[820px] mx-auto" data-testid="schema-editor">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-[16px] font-semibold" style={{ color: 'var(--text-high)' }}>
          Project schema (wiki/schema.md)
        </h2>
        <span
          className="text-[10px] px-2 py-0.5 rounded"
          style={{ background: 'var(--bg-3)', color: 'var(--text-mid)' }}
        >
          {content.length} / 50,000 chars
        </span>
      </div>
      <p className="text-[12.5px] mb-3" style={{ color: 'var(--text-mid)' }}>
        Edit conventions, page types, and ingest preferences. The LLM reads this
        before every compile + lint.
      </p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={loading}
        spellCheck={false}
        className="flex-1 px-3 py-2 rounded outline-none font-mono text-[12.5px] leading-[1.6]"
        style={{
          background: 'var(--bg-2)',
          border: '0.5px solid var(--hairline)',
          color: 'var(--text-default)',
          minHeight: 400,
        }}
      />
      {err && (
        <div className="mt-2 text-[12px]" style={{ color: 'var(--error)' }}>
          {err}
        </div>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={() => setContent(original)}
          disabled={!dirty}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-[12px] cursor-pointer disabled:opacity-40"
          style={{ color: 'var(--text-mid)' }}
        >
          <RotateCcw size={12} /> Revert
        </button>
        <button
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] rounded cursor-pointer disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          <Save size={12} /> {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
