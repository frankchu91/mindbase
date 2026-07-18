// apps/web/src/components/tree/CategoryTreeRoot.tsx
//
// Wiki v2 tree — consumes /api/tree (category summary) and /api/tree/:category
// (per-category listing). Renders the 8 canonical v2-layout categories:
//   readme, context, soul, contributors, research, raw, logs, artifacts.
//
// Auto-flattens the contributors group when there is only one user (solo
// projects — the common case). Uses local helpers only; the web bundle must
// not value-import from @mindbase/core.
import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

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
  }, [reloadKey]);

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
}: {
  cat: CategorySummary;
  onOpen: (c: string, p: string) => void;
  expanded: boolean;
  toggle: () => void;
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
      <div onClick={toggle} style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 13, color: 'var(--text-default)' }}>
        <span style={{ color: 'var(--text-faint)', marginRight: 4 }}>{expanded ? '▼' : '▶'}</span>
        {labelFor(cat.id)}{' '}
        <span style={{ color: 'var(--text-faint)', fontSize: 11, marginLeft: 4 }}>{cat.count ?? 0}</span>
      </div>
      {expanded && <CategoryChildren cat={cat} onOpen={onOpen} />}
    </div>
  );
}

function CategoryChildren({
  cat,
  onOpen,
}: {
  cat: CategorySummary;
  onOpen: (c: string, p: string) => void;
}) {
  const [data, setData] = useState<unknown>(null);
  useEffect(() => {
    apiGet(`/tree/${cat.id}`).then(setData).catch(() => setData({}));
  }, [cat.id]);
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
