import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { MetaJson, EdgeType } from '@mindbase/core';
import { useLiveEdit } from '../store/live-edit';
import { PencilLine, Sparkles } from 'lucide-react';
import { showToast } from '../store/toast';
import { CardsOnArticle } from './CardsOnArticle';
import { WikilinkPopover } from './WikilinkPopover';
import { WikiEditor } from './editor/WikiEditor';
import { NetworkPanel } from './NetworkPanel';
import { RightRail } from './note/RightRail';
import { BacklinksPanel } from './note/BacklinksPanel';
import { OutlinePanel, outlineCount } from './note/OutlinePanel';
import { MiniGraphPanel } from './note/MiniGraphPanel';
import { ProvenanceTrail, type ProvenanceSource } from './shell/ProvenanceTrail';
import { useCanvasRoute } from '../store/canvas-route';

interface Props {
  category: string;
  path: string;
  onBack: () => void;
  onOpenArticle: (category: string, path: string) => void;
  /** Open directly in edit mode (used right after creating a new note). */
  startEditing?: boolean;
  /** Open a raw imported source by ID. */
  onOpenRaw?: (rawId: string) => void;
  /** Fires after a delete/rename so parent can refresh the tree/list. */
  onWikiChanged?: () => void;
}

/** Derive a graph-index slug (basename without .md) from a tree path. */
function slugFromPath(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.md$/i, '');
}

export function ArticleView({ category, path, onBack, onOpenArticle, startEditing = false, onOpenRaw, onWikiChanged }: Props) {
  // Slug is derived from path for backward compat with inner subcomponents
  // (BacklinksPanel, NetworkPanel, MiniGraphPanel, WikiEditor, ProvenanceTrail,
  // CardsOnArticle, DailyNoteHeader, WikilinkPopover) which key off graph slugs.
  const slug = slugFromPath(path);

  const [compiling, setCompiling] = useState(false);
  async function compileToWiki() {
    if (compiling) return;
    useCanvasRoute.getState().navigate({
      kind: 'compile-progress',
      sourceSlug: slug,
      sourcePath: path,
    });
  }
  const [content, setContent] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(startEditing);

  async function trashFile() {
    if (!confirm(`Delete this file?\n\n${category}/${path}`)) return;
    try {
      const res = await fetch(`/api/tree/${category}/${path}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Trash failed: HTTP ${res.status}`);
      showToast('Deleted');
      onWikiChanged?.();
      onBack();
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  async function renameFile() {
    const newPath = prompt('New path (relative to category):', path);
    if (!newPath || newPath === path) return;
    try {
      const res = await fetch(`/api/tree/${category}/${path}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPath }),
      });
      if (!res.ok) throw new Error(`Rename failed: HTTP ${res.status}`);
      showToast('Renamed');
      onWikiChanged?.();
      // Re-route to the new path so the current view is in sync with disk.
      useCanvasRoute.getState().replace({
        kind: 'article',
        slug: slugFromPath(newPath),
        path: newPath,
        category,
        mode: editing ? 'edit' : 'read',
      });
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  const writingTo = useLiveEdit((s) => s.writingTo);
  const writingParagraph = useLiveEdit((s) => s.writingParagraph);

  // Re-enter edit mode if the caller navigates to a different freshly-created
  // note while the article view is already mounted (e.g. user spam-clicks +N).
  useEffect(() => {
    if (startEditing) setEditing(true);
  }, [slug, startEditing]);

  // Hover preview popover state
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);
  const [hoverEl, setHoverEl] = useState<HTMLElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/tree/${category}/${path}`)
      .then((r) => r.json())
      .then((data) => {
        setContent(data.body ?? data.content ?? '');
        setMeta(data.meta || null);
        setLoading(false);
      })
      .catch(() => {
        setContent('Failed to load article.');
        setMeta(null);
        setLoading(false);
      });
  }, [category, path]);

  const [typedOutgoing, setTypedOutgoing] = useState<Partial<Record<EdgeType, string[]>>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tree/${category}/${path}/typed-links`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setTypedOutgoing(data.typedOutgoing ?? {}); })
      .catch(() => { /* graceful — no typed-edge surface */ });
    return () => { cancelled = true; };
  }, [category, path]);

  function stripFrontmatter(text: string): string {
    return text.replace(/^---\n[\s\S]*?\n---\n?/, '');
  }

  function renderContent(text: string) {
    const stripped = stripFrontmatter(text);
    const parts = stripped.split(/\[\[([^\]]+)\]\]/g);
    const processed = parts.map((part, i) => {
      if (i % 2 === 1) {
        const [rawTarget, displayText] = part.split('|', 2);
        const target = (rawTarget ?? '').trim();
        const label = (displayText ?? rawTarget ?? '').trim();

        // [[raw:<id>]] is a source citation, not a wikilink. Emit a separate
        // anchor type so the click handler / popover / renderer can give it
        // distinct UX (small badge, opens the raw doc).
        const rawMatch = target.match(/^raw:([a-z0-9-]+)$/i);
        if (rawMatch) {
          return `[${label}](#raw:${rawMatch[1]})`;
        }

        const linkSlug = target.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-');
        return `[${label}](#wiki:${linkSlug})`;
      }
      return part;
    }).join('');
    return processed;
  }

  function getSourceBanner() {
    if (!meta) return null;
    const metaAny = meta as unknown as Record<string, unknown>;
    const isMcp = (metaAny['captured_via'] as string) === 'mcp' || !!metaAny['mcp_client'];
    if (isMcp) {
      return (
        <div className="rounded-lg p-3 my-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] tracking-wider uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Source</div>
          <div className="text-sm" style={{ color: 'var(--text-default)' }}>From AI conversation</div>
          {meta.captured_at && (
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {new Date(meta.captured_at).toLocaleDateString()}
            </div>
          )}
        </div>
      );
    }
    if (meta.captured_via && meta.captured_url) {
      let hostname = meta.captured_url;
      try { hostname = new URL(meta.captured_url).hostname; } catch { /* ignore */ }
      return (
        <div className="rounded-lg p-3 my-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] tracking-wider uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Source</div>
          <a
            href={meta.captured_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            {hostname} ↗
          </a>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            via {meta.captured_via}{meta.captured_at ? ` · ${new Date(meta.captured_at).toLocaleDateString()}` : ''}
          </div>
        </div>
      );
    }
    return null;
  }

  function handleMouseOver(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor || !anchor.hash?.startsWith('#wiki:')) return;
    const wikilinkSlug = anchor.hash.replace('#wiki:', '');
    if (hoverEl && hoverEl !== anchor) {
      setHoverSlug(null);
      setHoverEl(null);
    }
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setHoverSlug(wikilinkSlug);
      setHoverEl(anchor);
    }, 250);
  }

  function handleMouseOut(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;
    const next = (e as unknown as { relatedTarget?: HTMLElement | null }).relatedTarget;
    if (next && anchor.contains(next)) return;
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--surface-0)' }} data-testid={editing ? 'article-editor' : undefined}>
      {/* Top bar — back + title + Edit button */}
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <button onClick={onBack} className="text-[13px] cursor-pointer" style={{ color: 'var(--accent-azure)' }}>←</button>
        <div className="text-[12px] font-semibold tracking-tight truncate flex-1" style={{ color: 'var(--text-high)' }}>
          {slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </div>
        {!loading && !editing && (
          <>
            <button
              onClick={() => void compileToWiki()}
              disabled={compiling}
              className="text-[12px] px-2 py-1 rounded cursor-pointer inline-flex items-center gap-1.5"
              style={{
                color: 'var(--accent)',
                background: 'transparent',
                border: '0.5px solid var(--hairline)',
                opacity: compiling ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!compiling) e.currentTarget.style.background = 'var(--row-hover)'; }}
              onMouseLeave={(e) => { if (!compiling) e.currentTarget.style.background = 'transparent'; }}
              title="Compile this note → wiki (LLM picks create_concept / append / link / etc.)"
              data-testid="compile-to-wiki-button"
            >
              <Sparkles size={11} strokeWidth={1.8} />
              {compiling ? 'Compiling…' : 'Compile to Wiki'}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="text-[12px] px-2 py-1 rounded cursor-pointer inline-flex items-center gap-1.5"
              style={{
                color: 'var(--text-mid)',
                background: 'var(--bg-2)',
                border: '0.5px solid var(--hairline)',
              }}
            >
              <PencilLine size={11} strokeWidth={1.8} />
              Edit
            </button>
            <button
              onClick={() => void renameFile()}
              className="text-[12px] px-2 py-1 rounded cursor-pointer"
              style={{
                color: 'var(--text-mid)',
                background: 'transparent',
                border: '0.5px solid var(--hairline)',
              }}
              title="Rename this file"
              data-testid="article-rename-button"
            >
              Rename
            </button>
            <button
              onClick={() => void trashFile()}
              className="text-[12px] px-2 py-1 rounded cursor-pointer"
              style={{
                color: 'var(--error, #d88)',
                background: 'transparent',
                border: '0.5px solid var(--hairline)',
              }}
              title="Delete this file"
              data-testid="article-delete-button"
            >
              Delete
            </button>
          </>
        )}
      </div>

      {/* Body: main column (+ network panel on wide screens) */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto min-w-0">
          {loading ? (
            <div className="px-7 py-8 space-y-3">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-7 w-3/5" />
              <div className="skeleton h-4 w-full mt-6" />
              <div className="skeleton h-4 w-11/12" />
              <div className="skeleton h-4 w-4/5" />
            </div>
          ) : editing ? (
            <div className="flex flex-col h-full">
              <div className="flex-1 min-h-0">
                <WikiEditor
                  initialContent={content ?? ''}
                  slug={slug}
                  onCancel={() => setEditing(false)}
                  onSave={(savedContent) => {
                    setContent(savedContent);
                    setEditing(false);
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="px-7 py-8" data-testid="source-tab">
              {meta && (
                <ProvenanceTrail
                  slug={slug}
                  sources={derivedSources(meta as unknown as Record<string, unknown>)}
                  viaChatId={(meta as unknown as Record<string, unknown>)['compiled_via_chat_id'] as string | undefined ?? null}
                  viaChatLabel={(meta as unknown as Record<string, unknown>)['compiled_via_chat_label'] as string | undefined ?? null}
                  onOpenRaw={(rawId) => onOpenRaw?.(rawId)}
                  onOpenChat={(_chatId) => {
                    // Future: jump to the chat thread. For v1 a no-op is OK; the link
                    // doesn't render unless viaChatId is present in meta.
                  }}
                  typedOutgoing={typedOutgoing}
                  // TODO(v2): wikilink slugs have no explicit category; default
                  // to research per Phase E fallback contract.
                  onOpenSlug={(s) => onOpenArticle('research', `${s}.md`)}
                />
              )}
              <div className="text-[9.5px] tracking-[2px] uppercase font-semibold mb-2" style={{ color: 'var(--text-mid)' }}>
                Concept
              </div>
              <div
                className="prose prose-sm max-w-none"
                style={{
                  ['--tw-prose-body' as never]: 'var(--text-default)',
                  ['--tw-prose-headings' as never]: 'var(--text-high)',
                  ['--tw-prose-links' as never]: 'var(--accent-azure)',
                  ['--tw-prose-bold' as never]: 'var(--text-high)',
                  ['--tw-prose-quotes' as never]: 'var(--text-mid)',
                  ['--tw-prose-code' as never]: 'var(--text-default)',
                  ['--tw-prose-hr' as never]: 'var(--border-subtle)',
                  fontFamily: "'Charter', 'New York', Georgia, serif",
                  fontSize: '13px',
                  lineHeight: 1.7,
                } as React.CSSProperties}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const anchor = target.closest('a');
                  if (!anchor?.hash) return;
                  if (anchor.hash.startsWith('#wiki:')) {
                    e.preventDefault();
                    const linkedSlug = anchor.hash.replace('#wiki:', '');
                    // TODO(v2): wikilink target has no category context.
                    // Default to research per Phase E fallback contract; the
                    // server tree layout keeps wiki pages under research/.
                    onOpenArticle('research', `${linkedSlug}.md`);
                  } else if (anchor.hash.startsWith('#raw:')) {
                    e.preventDefault();
                    const rawId = anchor.hash.replace('#raw:', '');
                    if (onOpenRaw) onOpenRaw(rawId);
                  }
                }}
                onMouseOver={handleMouseOver}
                onMouseOut={handleMouseOut}
              >
                {getSourceBanner()}
                {(() => {
                  let pIndex = 0;
                  return (
                    <ReactMarkdown
                      components={{
                        // raw:<id> source citations render as a small inline
                        // pill, NOT a regular underlined link. Click bubbles
                        // up to the parent onClick which dispatches to
                        // onOpenRaw → RawSourceView.
                        a: ({ href, children, ...rest }) => {
                          if (href?.startsWith('#raw:')) {
                            const rawId = href.replace('#raw:', '');
                            return (
                              <a
                                {...rest}
                                href={href}
                                title={`Source: raw/${rawId}`}
                                style={{
                                  display: 'inline-block',
                                  fontSize: '0.78em',
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                  fontWeight: 500,
                                  letterSpacing: 0.2,
                                  color: 'var(--text-mid)',
                                  background: 'var(--bg-2, rgba(127,127,127,0.10))',
                                  border: '0.5px solid var(--hairline, rgba(127,127,127,0.20))',
                                  padding: '0px 6px',
                                  borderRadius: 3,
                                  textDecoration: 'none',
                                  marginLeft: 3,
                                  marginRight: 1,
                                  verticalAlign: 'baseline',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {rawId}
                              </a>
                            );
                          }
                          return <a {...rest} href={href}>{children}</a>;
                        },
                        p: ({ children, node, ...rest }) => {
                          const idx = pIndex++;
                          const isLive = writingTo === slug && writingParagraph === idx;
                          return (
                            <p
                              {...rest}
                              className={isLive ? 'editing-mark' : undefined}
                              style={isLive ? {
                                background: 'var(--live-soft)',
                                borderLeft: '2px solid var(--live)',
                                padding: '8px 12px',
                                borderRadius: '0 4px 4px 0',
                                position: 'relative',
                              } : undefined}
                            >
                              {children}
                              {isLive && (
                                <span style={{
                                  position: 'absolute',
                                  right: 12, top: 8,
                                  fontSize: 10, color: 'var(--live)', fontWeight: 600,
                                }}>
                                  ✏ writing…
                                </span>
                              )}
                            </p>
                          );
                        },
                      }}
                    >
                      {content ? renderContent(content) : ''}
                    </ReactMarkdown>
                  );
                })()}
              </div>

              {hoverSlug && hoverEl && (
                <WikilinkPopover
                  slug={hoverSlug}
                  anchorEl={hoverEl}
                  onClose={() => { setHoverSlug(null); setHoverEl(null); }}
                  // TODO(v2): wikilink popover slugs have no category — default research.
                  onOpen={(s) => onOpenArticle('research', `${s}.md`)}
                />
              )}

              <CardsOnArticle slug={slug} />
            </div>
          )}
        </div>

        {/* RightRail — Obsidian-style backlinks + outline. Always on for
            non-loading, non-editing article view. The wide-screen-only
            constraint that used to gate NetworkPanel is dropped here; RightRail
            handles its own responsive collapse via shellState. */}
        {!loading && !editing && (
          <RightRail
            tabs={[
              {
                id: 'outline',
                label: 'Outline',
                count: outlineCount(content ?? ''),
                render: () => <OutlinePanel markdown={content ?? ''} />,
              },
              {
                id: 'backlinks',
                label: 'Backlinks',
                render: () => <BacklinksPanel slug={slug} />,
              },
              {
                id: 'graph',
                label: 'Graph',
                render: () => <MiniGraphPanel slug={slug} />,
              },
              {
                id: 'network',
                label: 'Network',
                render: () => (
                  <NetworkPanel
                    slug={slug}
                    // TODO(v2): network-graph slugs lack category — default research.
                    onOpenNote={(s) => onOpenArticle('research', `${s}.md`)}
                    onInsertLink={(target) => {
                      const next = (content ?? '') + `\n\n[[${target}]]`;
                      const username = localStorage.getItem('mindbase-username') ?? '';
                      fetch(`/api/tree/${category}/${path}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'x-mindbase-user': username },
                        body: JSON.stringify({ body: next }),
                      }).then(() => { setContent(next); });
                    }}
                  />
                ),
              },
            ]}
            defaultTab="backlinks"
          />
        )}
      </div>
    </div>
  );
}

function derivedSources(meta: Record<string, unknown>): ProvenanceSource[] {
  const out: ProvenanceSource[] = [];
  const raw = (meta['sources'] ?? meta['raw_sources']) as unknown;
  if (Array.isArray(raw)) {
    for (const s of raw) {
      if (typeof s === 'string') {
        out.push({ id: s, label: shortenLabel(s) });
      } else if (typeof s === 'object' && s !== null) {
        const obj = s as Record<string, unknown>;
        const id = String(obj['id'] ?? obj['raw_id'] ?? '');
        const label = String(obj['title'] ?? obj['label'] ?? id);
        const kind = String(obj['kind'] ?? '') || undefined;
        if (id) out.push({ id, label: shortenLabel(label), kind });
      }
    }
  }
  return out;
}

function shortenLabel(s: string, max = 28): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
