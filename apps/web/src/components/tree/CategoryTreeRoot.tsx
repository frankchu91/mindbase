// apps/web/src/components/tree/CategoryTreeRoot.tsx
//
// Wiki v2 tree — consumes /api/tree (category summary) and /api/tree/:category
// (per-category listing). Renders the 8 canonical v2-layout categories:
//   readme, context, soul, contributors, research, raw, logs, artifacts.
//
// Auto-flattens the contributors group when there is only one user (solo
// projects — the common case). Uses local helpers only; the web bundle must
// not value-import from @mindbase/core.
import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../../lib/api';
import { showToast } from '../../store/toast';

type CategoryId = 'readme' | 'context' | 'soul' | 'contributors' | 'research' | 'raw' | 'logs' | 'artifacts';

interface CategorySummary {
  id: CategoryId;
  hasFile?: boolean;
  count?: number;
  lastBuilt?: string | null;
  unbuiltSourcesCount?: number;
  users?: Array<{ name: string; count: number; latest: string | null }>;
}

interface TreeSummary {
  project: string;
  categories: CategorySummary[];
}

interface Props {
  reloadKey?: number;
  onOpen: (category: string, path: string) => void;
}

export function CategoryTreeRoot({ reloadKey = 0, onOpen }: Props) {
  const [summary, setSummary] = useState<TreeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['contributors', 'research']));
  // Bumped by in-tree mutations (e.g. raw upload) so counts + children refresh.
  const [mutateKey, setMutateKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const s = await apiGet<TreeSummary>('/tree');
        setSummary(s);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [reloadKey, mutateKey]);

  if (error) return <div style={{ padding: 12, color: '#d88' }}>Tree load failed: {error}</div>;
  if (!summary) return <div style={{ padding: 12, color: 'var(--text-mid)' }}>Loading…</div>;

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  return (
    <div className="category-tree" style={{ padding: 8 }}>
      {summary.categories.map((cat) => (
        <CategoryNode
          key={cat.id}
          cat={cat}
          onOpen={onOpen}
          expanded={expanded.has(cat.id)}
          toggle={() => toggle(cat.id)}
          mutateKey={mutateKey}
          onMutate={() => setMutateKey((k) => k + 1)}
        />
      ))}
    </div>
  );
}

function CategoryNode({
  cat,
  onOpen,
  expanded,
  toggle,
  mutateKey,
  onMutate,
}: {
  cat: CategorySummary;
  onOpen: (c: string, p: string) => void;
  expanded: boolean;
  toggle: () => void;
  mutateKey: number;
  onMutate: () => void;
}) {
  const singleFile = ['readme', 'context', 'soul'].includes(cat.id);
  if (singleFile) {
    if (cat.id === 'soul' && !cat.hasFile) return null;
    return (
      <div
        onClick={() => onOpen(cat.id, '')}
        style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 13, color: 'var(--text-default)' }}
      >
        {labelFor(cat.id)}
        {cat.id === 'context' && cat.lastBuilt ? (
          <span style={{ color: 'var(--text-mid)', fontSize: 11, marginLeft: 6 }}>· {formatAge(cat.lastBuilt)}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={toggle}
        style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 13, color: 'var(--text-default)', display: 'flex', alignItems: 'center' }}
      >
        <span style={{ color: 'var(--text-faint)', marginRight: 4 }}>{expanded ? '▼' : '▶'}</span>
        {labelFor(cat.id)}
        <span style={{ color: 'var(--text-faint)', fontSize: 11, marginLeft: 4 }}>{cat.count ?? 0}</span>
        {cat.id === 'raw' && <RawUploadButton onUploaded={onMutate} />}
      </div>
      {expanded && <CategoryChildren cat={cat} onOpen={onOpen} reloadKey={mutateKey} onMutate={onMutate} />}
    </div>
  );
}

/**
 * Upload a .pdf/.md/.txt into sources/raw/. Two variants: 'icon' sits on the
 * Raw category row; 'row' is the discoverable empty-state row shown when the
 * category is expanded with no entries.
 */
function RawUploadButton({ onUploaded, variant = 'icon' }: { onUploaded: () => void; variant?: 'icon' | 'row' }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      showToast('File is over the 50MB limit.', 'error');
      return;
    }
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < buf.length; i += CHUNK) {
        bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
      }
      const res = await fetch('/api/tree/raw/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: btoa(bin), filename: file.name }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      showToast('Uploaded. Run /mb:contribute in your editor to ingest it into the wiki.', 'info');
      onUploaded();
    } catch (e) {
      showToast(`Upload failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          disabled={busy}
          title="Upload a PDF, .md, or .txt into sources/raw/"
          data-testid="raw-upload-button"
          style={{
            marginLeft: 'auto', padding: '1px 7px', fontSize: 11, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 5,
            color: 'var(--accent)', fontWeight: 500,
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? '…' : '⬆ Upload'}
        </button>
      ) : (
        <div
          onClick={() => { if (!busy) inputRef.current?.click(); }}
          data-testid="raw-upload-empty-row"
          style={{
            cursor: 'pointer', fontSize: 12, padding: '4px 8px 4px 24px',
            color: 'var(--accent)', opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? 'Uploading…' : '⬆ Upload a PDF, .md or .txt…'}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.md,.txt"
        style={{ display: 'none' }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleFile(f);
        }}
      />
    </>
  );
}

function CategoryChildren({
  cat,
  onOpen,
  reloadKey = 0,
  onMutate,
}: {
  cat: CategorySummary;
  onOpen: (c: string, p: string) => void;
  reloadKey?: number;
  onMutate?: () => void;
}) {
  const [data, setData] = useState<unknown>(null);
  useEffect(() => {
    apiGet(`/tree/${cat.id}`).then(setData).catch(() => setData({}));
  }, [cat.id, reloadKey]);
  if (!data) return <div style={{ paddingLeft: 24, color: 'var(--text-faint)', fontSize: 12 }}>…</div>;

  if (cat.id === 'contributors') {
    const users = (data as { users: Record<string, Array<{ date: string }>> }).users ?? {};
    const names = Object.keys(users);
    if (names.length === 0) return null;
    if (names.length === 1) {
      const only = names[0]!;
      return (
        <>
          {users[only]!.map((f) => (
            <div
              key={f.date}
              onClick={() => onOpen('contributors', `${only}/${f.date}.md`)}
              style={{ cursor: 'pointer', fontSize: 12, padding: '2px 8px 2px 24px', color: 'var(--text-default)' }}
            >
              {f.date}
            </div>
          ))}
        </>
      );
    }
    return (
      <>
        {names.map((user) => (
          <div key={user} style={{ paddingLeft: 24 }}>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', padding: '2px 0' }}>
              {user}{' '}
              <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{users[user]!.length}</span>
            </div>
            {users[user]!.map((f) => (
              <div
                key={f.date}
                onClick={() => onOpen('contributors', `${user}/${f.date}.md`)}
                style={{ cursor: 'pointer', fontSize: 12, padding: '2px 8px 2px 12px', color: 'var(--text-default)' }}
              >
                {f.date}
              </div>
            ))}
          </div>
        ))}
      </>
    );
  }

  if (cat.id === 'research' || cat.id === 'artifacts') {
    const files = (data as { files: Array<{ slug: string }> }).files ?? [];
    return (
      <>
        {files.map((f) => (
          <div
            key={f.slug}
            onClick={() => onOpen(cat.id, `${f.slug}.md`)}
            style={{ cursor: 'pointer', fontSize: 12, padding: '2px 8px 2px 24px', color: 'var(--text-default)' }}
          >
            {f.slug}
          </div>
        ))}
      </>
    );
  }

  if (cat.id === 'logs') {
    const days = (data as { days: string[] }).days ?? [];
    return (
      <>
        {days.map((d) => (
          <div
            key={d}
            onClick={() => onOpen('logs', `${d}.md`)}
            style={{ cursor: 'pointer', fontSize: 12, padding: '2px 8px 2px 24px', color: 'var(--text-default)' }}
          >
            {d}
          </div>
        ))}
      </>
    );
  }

  if (cat.id === 'raw') {
    const entries = (data as { entries: Array<{ date: string; id: string }> }).entries ?? [];
    if (entries.length === 0 && onMutate) {
      return <RawUploadButton variant="row" onUploaded={onMutate} />;
    }
    return (
      <>
        {entries.map((e) => (
          <div
            key={`${e.date}/${e.id}`}
            onClick={() => onOpen('raw', `${e.date}/${e.id}`)}
            style={{ cursor: 'pointer', fontSize: 12, padding: '2px 8px 2px 24px', color: 'var(--text-default)' }}
          >
            {e.date}/{e.id}
          </div>
        ))}
      </>
    );
  }

  return null;
}

function labelFor(id: string): string {
  const labels: Record<string, string> = {
    readme: 'README',
    context: 'Context',
    soul: 'Soul',
    contributors: 'Contributors',
    research: 'Research',
    raw: 'Raw',
    logs: 'Logs',
    artifacts: 'Artifacts',
  };
  return labels[id] ?? id;
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
