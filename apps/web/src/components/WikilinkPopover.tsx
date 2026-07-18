import { useEffect, useRef, useState } from 'react';

interface PreviewData {
  title: string;
  one_liner: string;
  excerpt: string;     // first ~240 chars of body, plain text
  found: boolean;      // false if page doesn't exist (broken link)
}

// In-memory cache so re-hovers are instant
const cache = new Map<string, PreviewData>();
const inFlight = new Map<string, Promise<PreviewData>>();

/**
 * Wikilink targets come to us in a few historical shapes:
 *  - v1 legacy path: `wiki/notes/<slug>.md` or `wiki/concepts/<slug>.md`
 *  - v2 category+path: `research/rag.md`, `contributors/haobing/2026-06-08.md`
 *  - bare slug (no category, no extension) — default to research per Phase E convention.
 * Map each to a `{category, relPath}` we can hit at `/api/tree/:category/*path`.
 */
function parseWikilinkPath(path: string): { category: string; path: string } {
  const legacy = path.match(/^wiki\/(notes|concepts)\/(.+)$/);
  if (legacy) return { category: 'research', path: legacy[2]! };
  const parts = path.split('/');
  if (parts.length >= 2) return { category: parts[0]!, path: parts.slice(1).join('/') };
  // TODO(v2): bare slug — assume research
  return { category: 'research', path: path.endsWith('.md') ? path : `${path}.md` };
}

async function fetchPreview(slug: string): Promise<PreviewData> {
  if (cache.has(slug)) return cache.get(slug)!;
  if (inFlight.has(slug)) return inFlight.get(slug)!;

  const { category, path: relPath } = parseWikilinkPath(`${slug}.md`);
  const promise = (async () => {
    try {
      const r = await fetch(`/api/tree/${category}/${relPath}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json() as { body?: string; meta?: { title?: string; one_liner?: string } | null };
      // Extract first ~240 chars of body, stripping markdown noise
      const body = (json.body ?? '')
        .replace(/^---[\s\S]*?---\n/, '')         // strip frontmatter
        .replace(/^#+ .*$/gm, '')                  // strip headings
        .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')  // unwrap wikilinks
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // unwrap markdown links
        .replace(/`([^`]+)`/g, '$1')               // strip inline code
        .replace(/\*\*?([^*]+)\*\*?/g, '$1')       // strip bold/italic
        .replace(/\n{2,}/g, ' ')                   // collapse paragraphs
        .replace(/\s+/g, ' ')
        .trim();
      const data: PreviewData = {
        title: json.meta?.title ?? slug.replace(/-/g, ' '),
        one_liner: json.meta?.one_liner ?? '',
        excerpt: body.slice(0, 240) + (body.length > 240 ? '…' : ''),
        found: true,
      };
      cache.set(slug, data);
      return data;
    } catch {
      const data: PreviewData = {
        title: slug.replace(/-/g, ' '),
        one_liner: '',
        excerpt: '',
        found: false,
      };
      cache.set(slug, data);
      return data;
    }
  })();
  inFlight.set(slug, promise);
  promise.finally(() => inFlight.delete(slug));
  return promise;
}

interface WikilinkPopoverProps {
  slug: string;
  anchorEl: HTMLElement;
  onClose: () => void;
  onOpen: (slug: string) => void;
  /** Cursor entered the popover — caller cancels pending hide. */
  onPointerEnter?: () => void;
  /** Cursor left the popover — caller schedules hide. */
  onPointerLeave?: () => void;
}

export function WikilinkPopover({ slug, anchorEl, onClose, onOpen, onPointerEnter, onPointerLeave }: WikilinkPopoverProps) {
  // Don't initialize state from cache.get(slug) — that only runs on FIRST mount,
  // so if React reuses this component across slug changes, `data` keeps the old
  // slug's content. Always start null and let the effect below derive from
  // cache or fetch on every slug change.
  const [data, setData] = useState<PreviewData | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position popover near the anchor. The caller (Milkdown plugin) may
  // hand us a stale element reference if ProseMirror re-rendered between
  // mouseover and the 250ms timer firing — detached elements give
  // getBoundingClientRect() = {0,0,0,0} and the popover ends up in the
  // top-left of the viewport. Defensively re-find a live chip with the
  // same data-target before computing position.
  useEffect(() => {
    let liveAnchor: HTMLElement = anchorEl;
    if (!document.body.contains(liveAnchor)) {
      const escAttr = slug.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const fresh = document.querySelector(
        `a.wikilink-chip[data-target="${escAttr}"]`,
      ) as HTMLElement | null;
      if (fresh) liveAnchor = fresh;
    }
    const r = liveAnchor.getBoundingClientRect();
    if (r.width === 0 && r.height === 0 && r.top === 0 && r.left === 0) {
      setPos(null);
      return;
    }
    const popHeight = 160;
    const popWidth = 360;
    let top = r.bottom + 8;
    let left = r.left;
    if (top + popHeight > window.innerHeight) {
      top = r.top - popHeight - 8;
    }
    if (left + popWidth > window.innerWidth - 16) {
      left = window.innerWidth - popWidth - 16;
    }
    if (left < 8) left = 8;
    setPos({ top, left });
  }, [anchorEl, slug]);

  // `raw:<id>` pseudo-slugs are source citations, not wiki pages. Don't
  // try to fetch a wiki note for them — the lookup would 404 and surface
  // a misleading "Page not found yet" message. Render a citation card
  // instead (handled in the JSX below).
  const isRawCitation = slug.startsWith('raw:');

  // Re-derive data on every slug change — either from cache, or by fetching.
  // This is the fix for "popover briefly shows the previous link's content":
  // we always reset to the cached value (or null) when slug changes, then
  // fetch if needed. The effect's cleanup also guards against late responses
  // arriving after the slug has already changed again.
  useEffect(() => {
    if (isRawCitation) { setData(null); return; }
    let cancelled = false;
    const cached = cache.get(slug);
    if (cached) {
      setData(cached);
      return;
    }
    setData(null);
    fetchPreview(slug).then((next) => {
      if (!cancelled) setData(next);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, isRawCitation]);

  // Close on outside click or escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current && !popoverRef.current.contains(t) && !anchorEl.contains(t)) {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [anchorEl, onClose]);

  if (!pos) return null;

  const rawId = isRawCitation ? slug.slice('raw:'.length) : '';

  return (
    <div
      ref={popoverRef}
      data-mb-wikilink-popover="1"
      onMouseEnter={onPointerEnter}
      onMouseLeave={() => { if (onPointerLeave) onPointerLeave(); else onClose(); }}
      className="fixed rounded-lg"
      style={{
        top: pos.top,
        left: pos.left,
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 9999,
        background: 'var(--win-bg)',
        border: '0.5px solid var(--hairline)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.20), 0 2px 8px rgba(0,0,0,0.10)',
        padding: 14,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {isRawCitation && (
        <div className="text-xs">
          <div className="uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)', fontSize: 10 }}>
            Source citation
          </div>
          <strong style={{ color: 'var(--text-high)' }}>raw:{rawId}</strong>
          <div className="mt-1" style={{ color: 'var(--text-mid)' }}>
            Inline citation — click to open the raw source in the right panel.
          </div>
          <button
            onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('mindbase:open-raw', { detail: rawId })); }}
            className="mt-3 text-xs"
            style={{ color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Open source →
          </button>
        </div>
      )}
      {!isRawCitation && !data && (
        <div className="text-xs" style={{ color: 'var(--text-mid)' }}>Loading…</div>
      )}
      {!isRawCitation && data && !data.found && (
        <div className="text-xs">
          <strong style={{ color: 'var(--text-high)' }}>{data.title}</strong>
          <div className="mt-1" style={{ color: 'var(--text-mid)' }}>Page not found yet</div>
        </div>
      )}
      {!isRawCitation && data && data.found && (
        <>
          <div className="font-semibold text-sm mb-1" style={{ color: 'var(--text-high)' }}>
            {data.title}
          </div>
          {data.one_liner && (
            <div className="text-xs italic mb-2" style={{ color: 'var(--text-mid)' }}>
              {data.one_liner}
            </div>
          )}
          {data.excerpt && (
            <div className="text-xs leading-relaxed" style={{ color: 'var(--text-default)' }}>
              {data.excerpt}
            </div>
          )}
          <button
            onClick={() => { onClose(); onOpen(slug); }}
            className="mt-3 text-xs"
            style={{ color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Click to open →
          </button>
        </>
      )}
    </div>
  );
}
