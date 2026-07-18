import { useEffect, useState } from 'react';
import { useCanvasRoute } from '../../store/canvas-route';
import { useBacklinksCache } from '../../store/backlinks-cache';

interface BacklinkRef {
  slug: string;
  title: string;
  path: string;
  snippet: string | null;
  edge_type: string;
}

interface Props {
  slug: string;
}

export function BacklinksPanel({ slug }: Props) {
  const [items, setItems] = useState<BacklinkRef[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useCanvasRoute((s) => s.navigate);
  const setCacheCount = useBacklinksCache((s) => s.set);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        // TODO(v2): BacklinksPanel is invoked with a bare slug from ArticleView,
        // so we default the category to `research` per the Phase E fallback
        // convention. If a caller needs backlinks for a non-research page,
        // widen Props to accept {category, path}.
        const r = await fetch(`/api/tree/research/${slug}.md/backlinks`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as {
          slug: string;
          backlinks: Array<{ from: string; edgeType: string; confidence?: number }>;
        };
        if (cancelled) return;
        // v2 shape gives us {from, edgeType} — project onto the display type
        // BacklinksPanel already rendered. title/path/snippet aren't returned
        // by the tree route yet; fall back to the source slug for both.
        const items: BacklinkRef[] = data.backlinks.map((b) => ({
          slug: b.from,
          title: b.from,
          path: `research/${b.from}.md`,
          snippet: null,
          edge_type: b.edgeType,
        }));
        setItems(items);
        setCacheCount(slug, items.length);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug, setCacheCount]);

  return (
    <div data-testid="backlinks-panel" className="space-y-1">
      {loading && (
        <div className="text-[11px] px-2 py-1" style={{ color: 'var(--text-faint)' }}>
          Loading…
        </div>
      )}
      {error && (
        <div className="text-[11px] px-2 py-1" style={{ color: 'var(--text-faint)' }}>
          Could not load backlinks.
        </div>
      )}
      {!loading && !error && items && items.length === 0 && (
        <div className="text-[11px] px-2 py-1" style={{ color: 'var(--text-faint)' }}>
          No backlinks yet.
        </div>
      )}
      {!loading && !error && items && items.map((it) => (
        <button
          key={`${it.slug}::${it.edge_type}`}
          onClick={() => navigate({ kind: 'note', slug: it.slug, path: it.path })}
          className="w-full text-left px-2 py-1 rounded cursor-pointer"
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          data-testid="backlinks-item"
        >
          <div className="text-[12px] truncate" style={{ color: 'var(--text-high)' }}>
            {it.title}
          </div>
          {it.snippet && (
            <div
              className="text-[10.5px] truncate"
              style={{ color: 'var(--text-faint)', fontFamily: 'ui-monospace, monospace' }}
            >
              {it.snippet}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
