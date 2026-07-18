import { useEffect, useRef, useState } from 'react';
import { FileCode2 } from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  setSetting,
  splitFile,
  joinFile,
  type SchemaSettings,
  type SettingPath,
} from '../../lib/schema-yaml';
import { SchemaEditor } from './SchemaEditor';

type Mode = 'settings' | 'raw';

type SettingDef =
  | { kind: 'bool'; path: SettingPath; label: string; help: string }
  | { kind: 'number'; path: SettingPath; label: string; help: string; min: number; max: number }
  | { kind: 'list'; path: SettingPath; label: string; help: string };

type Section = { title: string; items: SettingDef[] };

const SECTIONS: Section[] = [
  {
    title: 'Ingest',
    items: [
      {
        kind: 'bool',
        path: 'ingest.discuss_takeaways',
        label: 'Discuss takeaways before writing',
        help: 'Karpathy step 4 — the LLM proposes key claims and asks for confirmation before updating any wiki page.',
      },
      {
        kind: 'bool',
        path: 'ingest.require_citations',
        label: 'Require citations on every claim',
        help: 'Every assertion the LLM writes must be cited inline with [[raw:<id>]].',
      },
      {
        kind: 'bool',
        path: 'ingest.auto_classify_folders',
        label: 'Auto-classify new pages into folders',
        help: 'When creating a wiki page, the LLM picks a subfolder based on folders.json + classify-rules.md.',
      },
      {
        kind: 'number',
        path: 'ingest.target_pages_per_source',
        label: 'Target pages per source',
        help: 'Soft guideline for how aggressively to extract — survey papers benefit from 10+, single-claim posts from 2-3.',
        min: 1,
        max: 30,
      },
    ],
  },
  {
    title: 'Linking',
    items: [
      {
        kind: 'list',
        path: 'linking.edge_types',
        label: 'Edge types',
        help: 'Typed wikilink relationships. Add new types as patterns emerge in your project (e.g. cites, contradicts, supersedes).',
      },
    ],
  },
  {
    title: 'Lint',
    items: [
      {
        kind: 'number',
        path: 'lint.stale_after_days',
        label: 'Stale after (days)',
        help: 'Wiki pages with no edits in this window are flagged by the lint pass.',
        min: 7,
        max: 730,
      },
    ],
  },
  {
    title: 'Query',
    items: [
      {
        kind: 'bool',
        path: 'query.offer_to_file_back',
        label: 'Offer to file answers back',
        help: 'After answering a chat query, suggest saving the answer as a new wiki page.',
      },
    ],
  },
];

export function SchemaSettingsView() {
  const [mode, setMode] = useState<Mode>('settings');
  const [raw, setRaw] = useState<string>('');
  const [frontmatter, setFrontmatter] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [settings, setSettings] = useState<SchemaSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/project/schema');
        const d = (await r.json()) as { content: string };
        applyRaw(d.content);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function applyRaw(content: string): void {
    setRaw(content);
    const { frontmatter: fm, body: bd } = splitFile(content);
    setFrontmatter(fm);
    setBody(bd);
    setSettings(parseSettings(fm));
  }

  function scheduleSave(nextRaw: string): void {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(nextRaw), 400);
  }

  async function persist(nextRaw: string): Promise<void> {
    setErr(null);
    try {
      const r = await fetch('/api/project/schema', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: nextRaw }),
      });
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error ?? `HTTP ${r.status}`);
      }
      setSavedAt(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function update(path: SettingPath, value: boolean | number | string[]): void {
    const nextFm = setSetting(frontmatter, path, value);
    const nextRaw = joinFile(nextFm, body);
    setFrontmatter(nextFm);
    setRaw(nextRaw);
    setSettings(parseSettings(nextFm));
    scheduleSave(nextRaw);
  }

  if (mode === 'raw') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-end px-6 pt-4">
          <button
            onClick={() => {
              // Reload settings view from latest raw — user may have edited it.
              applyRaw(raw);
              setMode('settings');
            }}
            className="text-[12px] inline-flex items-center gap-1 px-2 py-1 rounded cursor-pointer"
            style={{ color: 'var(--text-mid)', border: '0.5px solid var(--hairline)' }}
          >
            Settings UI
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <SchemaEditor />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="schema-settings-view">
      <div className="px-8 py-6 max-w-[820px] mx-auto w-full">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--text-high)' }}>
              Project schema
            </h2>
            <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-mid)' }}>
              Settings the LLM reads before every ingest, query, and lint pass. Saved to{' '}
              <code style={{ color: 'var(--text-default)' }}>wiki/schema.md</code>.
            </p>
          </div>
          <button
            onClick={() => setMode('raw')}
            title="Edit raw schema.md"
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded cursor-pointer"
            style={{ color: 'var(--text-mid)', border: '0.5px solid var(--hairline)' }}
          >
            <FileCode2 size={13} /> Edit raw schema
          </button>
        </div>

        {loading && (
          <div className="mt-6 text-[12.5px]" style={{ color: 'var(--text-mid)' }}>
            Loading…
          </div>
        )}

        {!loading && (
          <div className="mt-6 space-y-8">
            {SECTIONS.map((section) => (
              <section key={section.title}>
                <div
                  className="text-[10.5px] uppercase tracking-[2px] font-semibold mb-3"
                  style={{ color: 'var(--text-mid)' }}
                >
                  {section.title}
                </div>
                <div
                  className="rounded overflow-hidden"
                  style={{ border: '0.5px solid var(--hairline)' }}
                >
                  {section.items.map((item, idx) => (
                    <SettingRow
                      key={item.path}
                      def={item}
                      settings={settings}
                      onUpdate={update}
                      isLast={idx === section.items.length - 1}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-6 h-5 text-[11.5px]" style={{ color: err ? 'var(--error)' : 'var(--text-mid)' }}>
          {err ?? (savedAt ? 'Saved' : '')}
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  def,
  settings,
  onUpdate,
  isLast,
}: {
  def: SettingDef;
  settings: SchemaSettings;
  onUpdate: (path: SettingPath, value: boolean | number | string[]) => void;
  isLast: boolean;
}) {
  const value = readPath(settings, def.path);

  return (
    <div
      className="flex items-start gap-4 px-4 py-3"
      style={{ borderBottom: isLast ? 'none' : '0.5px solid var(--hairline)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium" style={{ color: 'var(--text-high)' }}>
          {def.label}
        </div>
        <div className="text-[11.5px] mt-0.5 leading-[1.5]" style={{ color: 'var(--text-mid)' }}>
          {def.help}
        </div>
      </div>
      <div className="shrink-0 pt-0.5">
        {def.kind === 'bool' && (
          <Toggle checked={value as boolean} onChange={(v) => onUpdate(def.path, v)} />
        )}
        {def.kind === 'number' && (
          <input
            type="number"
            value={value as number}
            min={def.min}
            max={def.max}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onUpdate(def.path, Math.min(def.max, Math.max(def.min, n)));
            }}
            className="w-[72px] px-2 py-1 text-[12px] rounded outline-none text-right"
            style={{
              background: 'var(--bg-2)',
              border: '0.5px solid var(--hairline)',
              color: 'var(--text-default)',
            }}
          />
        )}
        {def.kind === 'list' && (
          <ListEditor
            value={value as string[]}
            onChange={(v) => onUpdate(def.path, v)}
          />
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex items-center cursor-pointer rounded-full transition-colors"
      style={{
        width: 32,
        height: 18,
        background: checked ? 'var(--accent)' : 'var(--bg-3)',
      }}
    >
      <span
        className="rounded-full transition-transform"
        style={{
          width: 14,
          height: 14,
          background: 'white',
          transform: checked ? 'translateX(16px)' : 'translateX(2px)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
        }}
      />
    </button>
  );
}

function ListEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');

  function add(): void {
    const v = draft.trim();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setDraft('');
  }
  function remove(v: string): void {
    onChange(value.filter((x) => x !== v));
  }

  return (
    <div className="flex flex-col gap-1.5 items-end">
      <div className="flex flex-wrap gap-1 justify-end max-w-[260px]">
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded"
            style={{ background: 'var(--bg-3)', color: 'var(--text-default)' }}
          >
            {v}
            <button
              onClick={() => remove(v)}
              className="opacity-60 hover:opacity-100 cursor-pointer"
              style={{ color: 'var(--text-mid)' }}
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="add edge type…"
        className="w-[140px] px-2 py-1 text-[11.5px] rounded outline-none"
        style={{
          background: 'var(--bg-2)',
          border: '0.5px solid var(--hairline)',
          color: 'var(--text-default)',
        }}
      />
    </div>
  );
}

function readPath(s: SchemaSettings, path: SettingPath): boolean | number | string[] {
  switch (path) {
    case 'ingest.discuss_takeaways':
      return s.ingest.discuss_takeaways;
    case 'ingest.require_citations':
      return s.ingest.require_citations;
    case 'ingest.auto_classify_folders':
      return s.ingest.auto_classify_folders;
    case 'ingest.target_pages_per_source':
      return s.ingest.target_pages_per_source;
    case 'linking.edge_types':
      return s.linking.edge_types;
    case 'lint.stale_after_days':
      return s.lint.stale_after_days;
    case 'query.offer_to_file_back':
      return s.query.offer_to_file_back;
  }
}
