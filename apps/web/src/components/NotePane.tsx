/**
 * NotePane.tsx
 *
 * Full-pane note editor that lives in the RIGHT panel (replacing the AI
 * chat surface). Notion / Bear / Apple Notes pattern: distinct Title input
 * at the top, body editor below. The markdown on disk stays unified
 * (`# Title\n\nBody`) — Title is just a visual + interaction split.
 *
 * Wiring:
 *  - LivePreviewEditor edits ONLY the body (no H1). Its internal autosave
 *    uses `transformBeforeSave` to re-attach the current Title as an H1.
 *  - Title input has its own debounced save (1s) so Title-only edits get
 *    persisted even when the body isn't touched.
 *  - Both save paths PUT to /api/wiki/notes/:slug with the same combined
 *    content; the later one wins.
 */

import { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { ArrowLeft, Sparkles, Eye, Code2 } from 'lucide-react';
import type { MetaJson } from '@mindbase/core';
import { FolderBreadcrumb } from './FolderBreadcrumb';
import { showToast } from '../store/toast';
import { useCanvasRoute } from '../store/canvas-route';
import { useRecentNotes } from '../store/recent-notes';
import { useNoteTitleCache } from '../store/note-titles';
import { RightRail } from './note/RightRail';
import { BacklinksPanel } from './note/BacklinksPanel';
import { OutlinePanel, outlineCount } from './note/OutlinePanel';
import { useBacklinksCache } from '../store/backlinks-cache';

const LivePreviewEditor = lazy(() =>
  import('./editor/LivePreviewEditor').then((m) => ({ default: m.LivePreviewEditor })),
);

interface Props {
  category: string;
  path: string;
  /** Switch the right pane back to chat. */
  onClose: () => void;
  /** Notify list to refresh after a save. */
  onWikiChanged: () => void;
  /** Used by DailyNoteHeader prev/next nav. */
  onOpenArticle: (category: string, path: string, startEditing?: boolean) => void;
  /** Autofocus the title input on mount (set true for fresh new notes). */
  autofocus?: boolean;
}

/** Derive a graph-index slug (basename without .md) from a tree path. */
function slugFromPath(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.md$/i, '');
}

/** Split markdown into a leading-H1 title and the remaining body. */
function splitTitleAndBody(markdown: string): { title: string; body: string } {
  const m = markdown.match(/^#\s+(.+?)\s*\n+/);
  if (m && m.index === 0) {
    return { title: m[1]!.trim(), body: markdown.slice(m[0].length) };
  }
  return { title: '', body: markdown };
}

/** Reassemble title + body into the full markdown document. */
function joinTitleAndBody(title: string, body: string): string {
  const t = title.trim() || 'Untitled';
  // Strip any H1 the editor might have re-introduced at the top so we don't double-title.
  const cleanBody = body.replace(/^#\s+.+?\n+/, '');
  return `# ${t}\n\n${cleanBody}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type ViewMode = 'rendered' | 'source';

function loadViewMode(slug: string): ViewMode {
  try {
    const v = localStorage.getItem(`mindbase.noteMode.${slug}`);
    if (v === 'source' || v === 'rendered') return v;
  } catch { /* ignore */ }
  return 'rendered';
}

function saveViewMode(slug: string, mode: ViewMode) {
  try { localStorage.setItem(`mindbase.noteMode.${slug}`, mode); }
  catch { /* ignore */ }
}

export function NotePane({ category, path, onClose, onWikiChanged, onOpenArticle, autofocus }: Props) {
  // Slug is derived from path for backward compat with inner subcomponents
  // (BacklinksPanel, OutlinePanel, LivePreviewEditor, DailyNoteHeader,
  // FolderBreadcrumb, useRecentNotes, useNoteTitleCache, useBacklinksCache)
  // which key off graph slugs.
  const slug = slugFromPath(path);
  const [title, setTitle] = useState('');
  const [bodyInitial, setBodyInitial] = useState('');
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode(slug));
  // Local mirror of the markdown body for source mode. Kept in sync with the
  // saved body on disk + with edits made in either mode.
  const [sourceBody, setSourceBody] = useState('');
  const sourceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reactive subscription so the RightRail tab can show "Backlinks · N" as soon
  // as the panel's fetch lands.
  const backlinksCount = useBacklinksCache((s) => s.counts[slug]);

  const titleRef = useRef<HTMLInputElement>(null);
  const getBodyRef = useRef<(() => string) | null>(null);
  const setBodyRef = useRef<((md: string) => void) | null>(null);
  const titleDirtyRef = useRef(false);
  const titleStateRef = useRef(title);
  useEffect(() => { titleStateRef.current = title; }, [title]);

  // Reloadable fetch — used both on mount/path-change and after a compile
  // that may have mutated the note on disk (propose_edit).
  const reloadFromDisk = useCallback(async () => {
    try {
      const r = await fetch(`/api/tree/${category}/${path}`);
      const data = (await r.json()) as { body?: string; content?: string; meta?: MetaJson | null };
      const content = data.body ?? data.content ?? '';
      const split = splitTitleAndBody(content);
      setTitle(split.title || data.meta?.title || '');
      setBodyInitial(split.body);
      setSourceBody(split.body);
      setMeta(data.meta ?? null);
      setSavedAt(null);
      titleDirtyRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [category, path]);

  // Load on mount / when path changes
  useEffect(() => {
    setLoading(true);
    void reloadFromDisk();
  }, [reloadFromDisk]);

  // Track this open in the recent-notes store so Cmd+K can surface it
  // when the user opens the palette with an empty query.
  // Also populate the note-title cache so CanvasToolbar's breadcrumb can
  // render the human title instead of the slug.
  useEffect(() => {
    if (loading) return;
    if (!title) return;
    useRecentNotes.getState().push({ slug, title, path });
    useNoteTitleCache.getState().set(slug, title);
  }, [slug, path, title, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autofocus title for fresh notes
  useEffect(() => {
    if (loading || !autofocus) return;
    const t = setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [loading, autofocus]);

  // Title-driven save (body changes are handled by LivePreviewEditor's internal autosave)
  const doSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const liveBody = getBodyRef.current?.() ?? bodyInitial;
      const content = joinTitleAndBody(titleStateRef.current, liveBody);
      const username = localStorage.getItem('mindbase-username') ?? '';
      const res = await fetch(`/api/tree/${category}/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-mindbase-user': username },
        body: JSON.stringify({ body: content }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json().catch(() => ({}))) as { rewritten?: boolean; content?: string };
      // If the server extracted inline base64 images and rewrote the markdown,
      // it returns { rewritten: true, content }. Push the rewritten body into
      // the editor IN-PLACE (no remount → no flash) and mirror into sourceBody.
      // NOTE(v2): /api/tree PUT does not currently emit rewritten payloads —
      // the base64 image extraction lives in the v1 /api/wiki/notes/:slug
      // handler. When we migrate that logic to /api/tree, this branch will
      // start firing again. Kept in place so re-enabling is a server change.
      if (data.rewritten && typeof data.content === 'string') {
        const split = splitTitleAndBody(data.content);
        setSourceBody(split.body);
        setBodyRef.current?.(split.body);
      }
      setSavedAt(new Date());
      titleDirtyRef.current = false;
      onWikiChanged();
    } catch (e) {
      showToast(`Save failed: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [category, path, bodyInitial, saving, onWikiChanged]);

  // Debounced save for title-only changes (1s)
  useEffect(() => {
    if (loading) return;
    if (!titleDirtyRef.current) return;
    const id = setTimeout(() => { void doSave(); }, 1000);
    return () => clearTimeout(id);
  }, [title, loading, doSave]);

  // Inject the current title into the body editor's saves so the body
  // editor's own autosave preserves the title H1.
  const transformBeforeSave = useCallback(
    (rawBody: string) => joinTitleAndBody(titleStateRef.current, rawBody),
    [],
  );

  // ⌘+S manual save (from anywhere in the pane, not just the editor)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSave]);

  // Auto-save when an image is pasted. The editor inserts the inline base64
  // into its local state; we give it 250ms to settle, then save. The server
  // extracts the base64, writes the file, returns `{rewritten, content}`, and
  // doSave updates editor state so Source view shows the clean attachment URL
  // — without the user needing to press ⌘S.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      let hasImage = false;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it && it.kind === 'file' && it.type.startsWith('image/')) {
          hasImage = true;
          break;
        }
      }
      if (!hasImage) return;
      // Wait for the editor to finish absorbing the paste, then trigger save.
      setTimeout(() => { void doSave(); }, 250);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [doSave]);

  function onTitleChange(value: string) {
    titleDirtyRef.current = true;
    setTitle(value);
  }

  // Source-mode autosave: when the user edits the raw markdown textarea,
  // debounce and write title + body back to disk. Keeps body state in sync
  // so switching back to rendered mode picks up the latest source edits.
  function onSourceBodyChange(value: string) {
    setSourceBody(value);
    if (sourceSaveTimer.current) clearTimeout(sourceSaveTimer.current);
    sourceSaveTimer.current = setTimeout(() => {
      void (async () => {
        if (saving) return;
        setSaving(true);
        try {
          const content = joinTitleAndBody(titleStateRef.current, value);
          const username = localStorage.getItem('mindbase-username') ?? '';
          const res = await fetch(`/api/tree/${category}/${path}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-mindbase-user': username },
            body: JSON.stringify({ body: content }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json().catch(() => ({}))) as { rewritten?: boolean; content?: string };
          setSavedAt(new Date());
          titleDirtyRef.current = false;
          if (data.rewritten && typeof data.content === 'string') {
            // Server extracted inline base64 — push rewritten content to
            // both the textarea state (sourceBody) and the rendered editor
            // (in place via setBodyRef → Milkdown replaceAll, no remount).
            const split = splitTitleAndBody(data.content);
            setSourceBody(split.body);
            setBodyRef.current?.(split.body);
          } else {
            setBodyInitial(value); // so a switch back to rendered mode is in sync
          }
        } catch (e) {
          showToast(`Save failed: ${(e as Error).message}`, 'error');
        } finally {
          setSaving(false);
        }
      })();
    }, 800);
  }

  // When switching modes, flush whatever the active editor has so the other
  // mode starts from the latest content (rather than the on-disk snapshot).
  function switchMode(next: ViewMode) {
    if (next === viewMode) return;
    if (viewMode === 'rendered' && next === 'source') {
      const liveBody = getBodyRef.current?.();
      // Only overwrite if the live ref has real content — an empty/undefined
      // response means the editor wasn't fully mounted, in which case the
      // existing sourceBody (seeded on load) is the right thing to show.
      if (liveBody && liveBody.length > 0) setSourceBody(liveBody);
    }
    if (viewMode === 'source' && next === 'rendered') {
      // sourceBody is already the latest — re-seed bodyInitial so the
      // Milkdown editor remounts with the freshest content
      setBodyInitial(sourceBody);
    }
    setViewMode(next);
    saveViewMode(slug, next);
  }

  async function compileToWiki() {
    if (compiling) return;
    if (titleDirtyRef.current || saving) await doSave();
    useCanvasRoute.getState().navigate({
      kind: 'compile-progress',
      sourceSlug: slug,
      sourcePath: path,
    });
  }

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && titleRef.current?.selectionStart === title.length)) {
      // Move focus into the editor body
      e.preventDefault();
      const editorEl = document.querySelector<HTMLElement>(
        '[data-testid="note-pane"] .ProseMirror, [data-testid="note-pane"] .milkdown',
      );
      editorEl?.focus();
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full pane-fade-in" data-testid="note-pane">
        <div
          className="flex items-center gap-3 px-6 py-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="skeleton h-4 w-16" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[760px] mx-auto px-10 py-10 space-y-4">
            <div className="skeleton h-10 w-2/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  const statusText = saving
    ? 'Saving…'
    : savedAt
      ? `Saved ${formatTime(savedAt)}`
      : titleDirtyRef.current
        ? 'Unsaved'
        : '';

  return (
    <div className="flex flex-col h-full pane-fade-in" data-testid="note-pane">
      {/* Top bar — back to chat + save status */}
      <div
        className="flex items-center gap-3 px-6 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <button
          onClick={onClose}
          className="icon-button focus-ring flex items-center gap-1.5 text-xs px-2 py-1"
          aria-label="Back to chat"
        >
          <ArrowLeft size={13} strokeWidth={1.8} />
          Chat
        </button>
        <span className="ml-auto text-[11px]" style={{ color: 'var(--text-mid)' }}>
          {statusText}
        </span>
        {/* Rendered / Source segmented toggle */}
        <div
          className="flex items-center rounded overflow-hidden"
          style={{ border: '0.5px solid var(--hairline)' }}
        >
          <button
            onClick={() => switchMode('rendered')}
            className="flex items-center gap-1 text-[11px] px-2 py-1 cursor-pointer"
            style={{
              background: viewMode === 'rendered' ? 'var(--bg-2)' : 'transparent',
              color: viewMode === 'rendered' ? 'var(--text-high)' : 'var(--text-mid)',
              fontWeight: viewMode === 'rendered' ? 600 : 500,
            }}
            title="Rendered (WYSIWYG)"
            data-testid="note-mode-rendered"
          >
            <Eye size={11} strokeWidth={1.8} /> Rendered
          </button>
          <button
            onClick={() => switchMode('source')}
            className="flex items-center gap-1 text-[11px] px-2 py-1 cursor-pointer"
            style={{
              background: viewMode === 'source' ? 'var(--bg-2)' : 'transparent',
              color: viewMode === 'source' ? 'var(--text-high)' : 'var(--text-mid)',
              fontWeight: viewMode === 'source' ? 600 : 500,
              borderLeft: '0.5px solid var(--hairline)',
            }}
            title="Source (raw markdown)"
            data-testid="note-mode-source"
          >
            <Code2 size={11} strokeWidth={1.8} /> Source
          </button>
        </div>
        <button
          onClick={() => void compileToWiki()}
          disabled={compiling}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded cursor-pointer"
          style={{
            background: compiling ? 'transparent' : 'var(--accent-soft, transparent)',
            color: 'var(--accent)',
            border: '0.5px solid var(--hairline)',
            opacity: compiling ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { if (!compiling) e.currentTarget.style.background = 'var(--row-hover)'; }}
          onMouseLeave={(e) => { if (!compiling) e.currentTarget.style.background = 'var(--accent-soft, transparent)'; }}
          title="Compile this note → wiki (LLM decides what to create/update)"
          data-testid="compile-to-wiki-button"
        >
          <Sparkles size={13} strokeWidth={1.8} />
          {compiling ? 'Compiling…' : 'Compile to Wiki'}
        </button>
      </div>

      {/* Document area + RightRail row */}
      <div className="flex-1 min-h-0 flex">
        {/* Editor column */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-[760px] mx-auto px-10 py-10">
            {/* Breadcrumb */}
            <FolderBreadcrumb slug={slug} />

            {/* Title */}
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              onKeyDown={onTitleKeyDown}
              placeholder="Untitled"
              className="w-full text-[40px] leading-tight font-bold bg-transparent outline-none mb-6"
              style={{ color: 'var(--text-primary)' }}
              spellCheck={false}
            />

            {/* Body editor */}
            {viewMode === 'rendered' ? (
              <Suspense
                fallback={
                  <div className="text-sm" style={{ color: 'var(--text-faint)' }}>
                    Loading editor…
                  </div>
                }
              >
                <LivePreviewEditor
                  key={slug}
                  initialContent={bodyInitial}
                  slug={slug}
                  onSave={() => { /* internal */ }}
                  onCancel={onClose}
                  onModeChange={() => { /* mode toggle lives in NotePane's top bar now */ }}
                  getContentRef={getBodyRef as React.MutableRefObject<(() => string) | null>}
                  setContentRef={setBodyRef}
                  transformBeforeSave={transformBeforeSave}
                  onMarkdownChange={(md) => setSourceBody(md)}
                  hideToolbar
                />
              </Suspense>
            ) : (
              <textarea
                value={sourceBody}
                onChange={(e) => onSourceBodyChange(e.target.value)}
                spellCheck={false}
                className="w-full bg-transparent outline-none resize-none"
                style={{
                  minHeight: '60vh',
                  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: 'var(--text-default)',
                  whiteSpace: 'pre-wrap',
                }}
                data-testid="note-source-textarea"
              />
            )}
          </div>
        </div>

        {/* RightRail — tabbed: Outline | Backlinks */}
        <RightRail
          defaultTab="backlinks"
          tabs={[
            {
              id: 'outline',
              label: 'Outline',
              count: outlineCount(sourceBody),
              render: () => <OutlinePanel markdown={sourceBody} />,
            },
            {
              id: 'backlinks',
              label: 'Backlinks',
              count: backlinksCount,
              render: () => <BacklinksPanel slug={slug} />,
            },
          ]}
        />
      </div>
    </div>
  );
}
