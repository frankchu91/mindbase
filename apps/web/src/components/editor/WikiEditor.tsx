/**
 * WikiEditor.tsx
 *
 * Thin wrapper that switches between:
 *  - LivePreviewEditor (Milkdown, default) — Preview mode
 *  - CodeMirror source editor (existing code, unchanged) — Source mode
 *
 * Mode is persisted per-page to localStorage:
 *   key: "mindbase.editorMode.<slug>" → "preview" | "source"
 *
 * ⌘+/ toggles between modes. When switching:
 *   Preview → Source: serialize current ProseMirror doc → Markdown → seed CodeMirror
 *   Source → Preview: read CodeMirror content → pass as initialContent to LivePreviewEditor
 */

import { useEffect, useRef, useState, useCallback, Suspense, lazy } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { wikilinkCompletions } from './wikilinkAutocomplete';
import { SlashMenu } from './SlashMenu';
import type { EditorMode } from './EditorToolbar';

// Lazy-import LivePreviewEditor so the Milkdown bundle only loads when editing
const LivePreviewEditor = lazy(() =>
  import('./LivePreviewEditor').then((m) => ({ default: m.LivePreviewEditor })),
);

interface Props {
  initialContent: string;
  slug: string;
  /**
   * v2 tree coordinates. Optional for legacy callers that still pass only a
   * slug — in that case we default to `research/<slug>.md` per the Phase E
   * fallback convention (see TODO(v2) at each site).
   */
  category?: string;
  path?: string;
  onSave: (savedContent: string) => void;
  onCancel: () => void;
}

function loadMode(slug: string): EditorMode {
  try {
    const stored = localStorage.getItem(`mindbase.editorMode.${slug}`);
    if (stored === 'source' || stored === 'preview') return stored;
  } catch { /* ignore */ }
  return 'preview';
}

function saveMode(slug: string, mode: EditorMode) {
  try {
    localStorage.setItem(`mindbase.editorMode.${slug}`, mode);
  } catch { /* ignore */ }
}

// ─── Source-mode CodeMirror editor (extracted from original WikiEditor) ────────

function SourceEditor({
  initialContent,
  slug,
  category,
  path,
  onSave,
  onCancel,
  onModeChange,
}: {
  initialContent: string;
  slug: string;
  category: string;
  path: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  onModeChange: (mode: EditorMode) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slashMenu, setSlashMenu] = useState<{
    pos: { top: number; left: number };
    query: string;
  } | null>(null);
  const [aiInProgress, setAiInProgress] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!savedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [savedAt]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const doSave = useCallback(async (): Promise<void> => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const currentContent = viewRef.current?.state.doc.toString() ?? '';
      const username = localStorage.getItem('mindbase-username') ?? '';
      const res = await fetch(`/api/tree/${category}/${path}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-mindbase-user': username },
        body: JSON.stringify({ body: currentContent }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err}`);
      }
      setSavedAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [category, path]);

  function scheduleAutosave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void doSave(); }, 2000);
  }

  function checkSlashTrigger(view: EditorView) {
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const beforeCursor = view.state.doc.sliceString(line.from, head);
    const m = beforeCursor.match(/^\/([^/\n]*)$/);
    if (m) {
      const coords = view.coordsAtPos(head);
      if (coords) {
        const top = Math.min(coords.bottom + 4, window.innerHeight - 4);
        setSlashMenu({ pos: { top, left: coords.left }, query: m[1] ?? '' });
      }
    } else {
      setSlashMenu(null);
    }
  }

  async function runAI(_kind: 'continue' | 'summarize' | 'expand' | 'translate') {
    // TODO(v2): migrate /api/wiki/ai-complete to /api/tree/ai-complete (or a
    // sibling namespace) and restore streaming completion. The v1 route was
    // removed with wiki.ts; disable the feature quietly so slash commands and
    // the AI bubble menu don't 404 during migration.
    setError('AI completion is disabled during the v2 tree migration.');
    setAiInProgress(false);
  }

  useEffect(() => {
    if (!hostRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        scheduleAutosave();
      }
      if ((update.selectionSet || update.docChanged) && viewRef.current) {
        checkSlashTrigger(viewRef.current);
      }
    });

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => { void doSave(); return true; },
          },
          {
            key: 'Mod-/',
            preventDefault: true,
            run: () => { onModeChange('preview'); return true; },
          },
        ]),
        markdown(),
        autocompletion({ override: [wikilinkCompletions] }),
        syntaxHighlighting(defaultHighlightStyle),
        EditorView.lineWrapping,
        updateListener,
        EditorView.theme({
          '&': {
            fontSize: '14px',
            fontFamily: "'Charter', 'New York', Georgia, serif",
            height: '100%',
            color: 'var(--text-high, #f3f4f6)',
            caretColor: 'var(--accent-azure, #60a5fa)',
          },
          '.cm-content': {
            padding: '12px 0',
            minHeight: '300px',
            textDecoration: 'none',
            color: 'var(--text-high, #f3f4f6)',
            caretColor: 'var(--accent-azure, #60a5fa)',
          },
          '.cm-content, .cm-content *': {
            textDecoration: 'none !important',
            textUnderlineOffset: 'unset !important',
          },
          '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: 'var(--accent-azure, #60a5fa) !important',
            borderLeftWidth: '2px',
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: 'var(--accent-azure, #60a5fa) !important',
          },
          '.cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: 'rgba(96, 165, 250, 0.28) !important',
          },
          '&.cm-focused .cm-selectionBackground': {
            backgroundColor: 'rgba(96, 165, 250, 0.4) !important',
          },
          '.cm-line': { padding: '0 12px' },
          '.cm-gutters': { display: 'none' },
          '.cm-focused': { outline: 'none' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    view.focus();

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ago = savedAt ? Math.round((Date.now() - savedAt.getTime()) / 1000) : null;
  void tick;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--surface-0)' }}>
      {/* Toolbar */}
      <div
        className="px-5 py-3 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}
      >
        <button
          onClick={onCancel}
          className="text-[13px] cursor-pointer"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', padding: 0 }}
        >
          Cancel
        </button>
        <div className="flex-1 text-[12px]" style={{ color: 'var(--text-mid)' }}>
          {saving
            ? 'Saving…'
            : savedAt
              ? `Saved ${ago === 0 ? 'just now' : `${ago}s ago`}`
              : 'Source mode · type / for commands · [[ for wikilinks · ⌘S to save'}
        </div>
        {aiInProgress && (
          <div className="text-[11px]" style={{ color: 'var(--accent-amber)' }}>AI thinking…</div>
        )}
        {/* Mode toggle */}
        <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={() => onModeChange('preview')}
            className="px-3 py-1 text-[12px] cursor-pointer"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: 'none', borderRight: '1px solid var(--border)' }}
            title="Live Preview (⌘+/)"
          >
            👁 Preview
          </button>
          <button
            className="px-3 py-1 text-[12px] cursor-pointer"
            style={{ background: 'var(--accent-azure)', color: 'white', border: 'none' }}
            disabled
            title="Source mode (active)"
          >
            &lt;/&gt; Source
          </button>
        </div>
        <button
          onClick={() => { void doSave(); }}
          disabled={saving}
          className="px-3 py-1 text-[12px] rounded cursor-pointer"
          style={{ background: 'var(--accent-azure)', color: 'white', border: 'none' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => {
            void doSave().then(() => {
              const content = viewRef.current?.state.doc.toString() ?? '';
              onSave(content);
            });
          }}
          className="px-3 py-1 text-[12px] rounded cursor-pointer"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-default)' }}
        >
          Done
        </button>
      </div>

      {error && (
        <div
          className="px-5 py-2 text-[11px] flex items-center gap-2"
          style={{ background: 'var(--error-bg, #fef2f2)', color: 'var(--error, #dc2626)', flexShrink: 0 }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      <div ref={hostRef} className="flex-1 overflow-y-auto px-7 py-4" />

      {slashMenu && viewRef.current && (
        <SlashMenu
          view={viewRef.current}
          pos={slashMenu.pos}
          query={slashMenu.query}
          onClose={() => setSlashMenu(null)}
          onAI={(kind) => { void runAI(kind); }}
        />
      )}
    </div>
  );
}

// ─── WikiEditor wrapper ────────────────────────────────────────────────────────

export function WikiEditor({ initialContent, slug, category, path, onSave, onCancel }: Props) {
  const [mode, setMode] = useState<EditorMode>(() => loadMode(slug));
  // TODO(v2): fall back to research/<slug>.md when caller passes only a slug.
  // Once all callers pass {category, path} explicitly, drop the fallback.
  const effectiveCategory = category ?? 'research';
  const effectivePath = path ?? `${slug}.md`;

  // When mode changes, current content is passed as the seed for the next editor.
  // We hold it in state so switching carries content across.
  const [content, setContent] = useState(initialContent);

  // Ref for LivePreviewEditor to expose its current markdown imperatively
  const liveGetContentRef = useRef<(() => string) | null>(null);

  // Source editor exposes its content via CodeMirror viewRef (handled in SourceEditor)
  // We need a ref for that too — but SourceEditor is self-contained, so we use a
  // callback-based approach: when mode toggles away from Source, we get content via
  // a shared ref.
  const sourceContentRef = useRef<string>(initialContent);

  function handleModeChange(newMode: EditorMode) {
    if (newMode === mode) return;

    // Capture current content before switching
    if (mode === 'preview') {
      const md = liveGetContentRef.current?.() ?? content;
      setContent(md);
      sourceContentRef.current = md;
    } else {
      // source → preview: sourceContentRef is kept up to date by SourceEditor via onSave-like
      // We use the ref we set whenever SourceEditor would have autosaved
      setContent(sourceContentRef.current);
    }

    setMode(newMode);
    saveMode(slug, newMode);
  }

  // ⌘+/ global shortcut (supplements per-editor shortcuts)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleModeChange(mode === 'preview' ? 'source' : 'preview');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (mode === 'source') {
    return (
      <SourceEditor
        initialContent={content}
        slug={slug}
        category={effectiveCategory}
        path={effectivePath}
        onSave={(savedContent) => {
          sourceContentRef.current = savedContent;
          onSave(savedContent);
        }}
        onCancel={onCancel}
        onModeChange={handleModeChange}
      />
    );
  }

  // Preview mode (default)
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--text-muted)' }}>
          Loading editor…
        </div>
      }
    >
      <LivePreviewEditor
        initialContent={content}
        slug={slug}
        onSave={(savedContent) => {
          setContent(savedContent);
          onSave(savedContent);
        }}
        onCancel={onCancel}
        onModeChange={handleModeChange}
        getContentRef={liveGetContentRef}
      />
    </Suspense>
  );
}
