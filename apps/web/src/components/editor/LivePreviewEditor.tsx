/**
 * LivePreviewEditor.tsx
 *
 * Notion-style live preview editor powered by Milkdown (ProseMirror under the hood).
 * Renders Markdown live while editing — storage stays plain .md on disk.
 *
 * Concession notes:
 * - AI commands use modal flow (not real-time streaming) due to ProseMirror
 *   transaction complexity vs CodeMirror's simple dispatch. This is Concession #3.
 * - Wikilink autocomplete on [[ is a basic dropdown (no SlashProvider needed).
 * - Mermaid is skipped in v1 (Concession #2) — @milkdown/plugin-diagram not included.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { upload, uploadConfig } from '@milkdown/kit/plugin/upload';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { replaceAll } from '@milkdown/kit/utils';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';

import type { EditorMode } from './EditorToolbar';
import { wikilinkPlugins, makeWikilinkInteractionPlugin } from './plugins/wikilink';
import { calloutPlugin } from './plugins/callout';
import { makeImageUploader } from './plugins/image-paste';
import { WikilinkPopover } from '../WikilinkPopover';
import { SlashMenu } from './SlashMenu';
import { SLASH_COMMANDS } from './slashCommands';
import type { EditorView as ProseMirrorView } from '@milkdown/kit/prose/view';
import { AIBubbleMenu } from './AIBubbleMenu';

// ─── Wikilink autocomplete state ─────────────────────────────────────────────

let wikiSlugsCache: Array<{ slug: string; title: string }> | null = null;
let wikiSlugsCacheAt = 0;

async function fetchWikiSlugs(): Promise<Array<{ slug: string; title: string }>> {
  if (wikiSlugsCache && Date.now() - wikiSlugsCacheAt < 60_000) return wikiSlugsCache;
  try {
    // Union contributors + research per Phase F wikilinkAutocomplete pattern —
    // the flat /api/wiki listing is gone.
    const [contributorsRes, researchRes] = await Promise.all([
      fetch('/api/tree/contributors').then((r) => (r.ok ? r.json() : { users: {} })),
      fetch('/api/tree/research').then((r) => (r.ok ? r.json() : { files: [] })),
    ]);
    const items: Array<{ slug: string; title: string }> = [];
    const users = (contributorsRes as { users?: Record<string, Array<{ date: string }>> }).users ?? {};
    for (const [user, days] of Object.entries(users)) {
      for (const d of days) {
        const key = `${user}/${d.date}`;
        items.push({ slug: key, title: key });
      }
    }
    const research = (researchRes as { files?: Array<{ slug: string; title?: string }> }).files ?? [];
    for (const f of research) {
      items.push({ slug: f.slug, title: f.title ?? f.slug });
    }
    wikiSlugsCache = items;
    wikiSlugsCacheAt = Date.now();
    return wikiSlugsCache;
  } catch {
    return wikiSlugsCache ?? [];
  }
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  initialContent: string;
  slug: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  onModeChange: (mode: EditorMode) => void;
  /** Called by parent to imperatively get current markdown */
  getContentRef: React.MutableRefObject<(() => string) | null>;
  /**
   * Optional: parent passes a ref; we bind a setter that replaces the editor's
   * current document with the given markdown. Use this for post-save resync
   * (e.g. server extracted inline base64) WITHOUT remounting the editor.
   */
  setContentRef?: React.MutableRefObject<((md: string) => void) | null>;
  /**
   * Optional content transformer applied right before PUTting to the wiki API.
   * Lets a parent (e.g. NotePane) prepend a separately-controlled Title as an
   * `# H1` to the body content before save. Identity function if omitted.
   */
  transformBeforeSave?: (rawMarkdown: string) => string;
  /**
   * Optional callback fired on every markdown change. NotePane uses this
   * to mirror body edits into its own state if it needs to assemble the
   * full document for its own (title-driven) save path.
   */
  onMarkdownChange?: (markdown: string) => void;
  /**
   * Hide the internal toolbar (Cancel / Preview / Source / Save / Done).
   * Used when the parent (e.g. NotePane) provides its own chrome and the
   * editor should be a clean canvas. Autosave + ⌘S still work via keymap.
   */
  hideToolbar?: boolean;
}

// ─── Inner Milkdown component (must be inside MilkdownProvider) ──────────────

function MilkdownInner({
  initialContent,
  slug,
  onMarkdownChange,
  onEditorReady,
  onWikilinkHover,
  onWikilinkHoverOut,
  onWikilinkClick,
}: {
  initialContent: string;
  slug: string;
  onMarkdownChange: (md: string) => void;
  onEditorReady: (editor: Editor) => void;
  onWikilinkHover: (target: string, el: HTMLElement) => void;
  onWikilinkHoverOut: () => void;
  onWikilinkClick: (target: string, modifiers: { meta: boolean; ctrl: boolean }) => void;
}) {
  const wikilinkInteraction = makeWikilinkInteractionPlugin(
    onWikilinkHover,
    onWikilinkHoverOut,
    onWikilinkClick,
  );

  const { loading } = useEditor(
    (root) => {
      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, initialContent);

          // Listener: fire on every markdown change
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onMarkdownChange(markdown);
          });

          // Upload config for image paste
          ctx.set(uploadConfig.key, {
            uploader: makeImageUploader(slug),
            enableHtmlFileUploader: true,
            uploadWidgetFactory: (_pos, _spec) => {
              const { Decoration } = require('@milkdown/kit/prose/view') as typeof import('@milkdown/kit/prose/view');
              const el = document.createElement('span');
              el.textContent = '⏳ Uploading…';
              el.style.cssText = 'color:var(--text-muted);font-size:12px;';
              return Decoration.widget(_pos, el, _spec);
            },
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(clipboard)
        .use(upload)
        .use(wikilinkPlugins as MilkdownPlugin[])
        .use(wikilinkInteraction as MilkdownPlugin)
        .use(calloutPlugin as MilkdownPlugin);

      void editor.create().then((e) => {
        onEditorReady(e);
      });

      return editor;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div
      className="milkdown-wrapper"
      style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.15s' }}
    >
      <Milkdown />
    </div>
  );
}

// ─── Main LivePreviewEditor component ────────────────────────────────────────

export function LivePreviewEditor({
  initialContent,
  slug,
  onSave,
  onCancel,
  onModeChange,
  getContentRef,
  setContentRef,
  transformBeforeSave,
  onMarkdownChange,
  hideToolbar = false,
}: Props) {
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markdownRef = useRef<string>(initialContent);
  // Refs so doSave/handleMarkdownChange capture stable identity but always
  // read the latest props (avoids stale-closure bugs when title changes).
  const transformBeforeSaveRef = useRef(transformBeforeSave);
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  useEffect(() => { transformBeforeSaveRef.current = transformBeforeSave; }, [transformBeforeSave]);
  useEffect(() => { onMarkdownChangeRef.current = onMarkdownChange; }, [onMarkdownChange]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiInProgress, setAiInProgress] = useState(false);
  const [tick, setTick] = useState(0);

  // Slash menu state
  const [slashMenuState, setSlashMenuState] = useState<{
    pos: { top: number; left: number };
    query: string;
  } | null>(null);

  // Wikilink autocomplete
  const [wikilinkAC, setWikilinkAC] = useState<{
    pos: { top: number; left: number };
    query: string;
    results: Array<{ slug: string; title: string }>;
  } | null>(null);

  // Wikilink popover (hover preview)
  // State machine for hover-with-grace-period (Radix Tooltip pattern):
  //   chip-enter → schedule show (200ms)
  //   chip-leave → schedule hide (180ms)  // gap-crossing grace
  //   popover-enter → cancel hide
  //   popover-leave → schedule hide (immediate / 0ms)
  //   ESC / click outside → cancel both, hide now
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);
  const [hoverEl, setHoverEl] = useState<HTMLElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearShowTimer(): void {
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null; }
  }
  function clearHideTimer(): void {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  }
  function scheduleShow(target: string, el: HTMLElement): void {
    clearHideTimer();
    clearShowTimer();
    showTimerRef.current = setTimeout(() => {
      // Re-find a live chip — ProseMirror may have re-rendered.
      const escAttr = target.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const live = document.querySelector(
        `a.wikilink-chip[data-target="${escAttr}"]`,
      ) as HTMLElement | null;
      const anchor = live && document.body.contains(live) ? live : el;
      if (!document.body.contains(anchor)) return;
      setHoverSlug(target);
      setHoverEl(anchor);
    }, 200);
  }
  function scheduleHide(delayMs: number): void {
    clearShowTimer();
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setHoverSlug(null);
      setHoverEl(null);
    }, delayMs);
  }
  // Cleanup on unmount.
  useEffect(() => {
    return () => { clearShowTimer(); clearHideTimer(); };
  }, []);

  // ProseMirror view — populated once after Milkdown editor init, used by AIBubbleMenu.
  const [pmView, setPmView] = useState<unknown>(null);

  // expose getContent to parent
  useEffect(() => {
    getContentRef.current = () => markdownRef.current;
    return () => {
      getContentRef.current = null;
    };
  }, [getContentRef]);

  // expose setContent to parent (used by NotePane for post-save resync after
  // server extracted inline base64 — swap content in place without remount)
  useEffect(() => {
    if (!setContentRef) return;
    setContentRef.current = (md: string) => {
      if (!editorRef.current) return;
      // Update local ref first so the markdownListener no-ops if Milkdown
      // emits a synthetic change event during replaceAll.
      markdownRef.current = md;
      try {
        editorRef.current.action(replaceAll(md));
      } catch (e) {
        console.error('[LivePreviewEditor] setContent failed:', e);
      }
    };
    return () => {
      if (setContentRef) setContentRef.current = null;
    };
  }, [setContentRef]);

  // Phase 3D: set data-heading-id + id on rendered headings so OutlinePanel
  // can scroll to them via scrollIntoView. Coalesced via rAF — Milkdown emits
  // a flood of mutations during initial render, so the naive observer-per-
  // mutation pattern blocks the main thread on note open.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function doSync() {
      if (!el) return;
      const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const seen = new Map<string, number>();
      headings.forEach((h) => {
        const text = (h.textContent ?? '').trim();
        let anchor = text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        if (seen.has(anchor)) {
          const n = seen.get(anchor)! + 1;
          seen.set(anchor, n);
          anchor = `${anchor}-${n}`;
        } else {
          seen.set(anchor, 0);
        }
        if (h.getAttribute('data-heading-id') !== anchor) {
          h.setAttribute('data-heading-id', anchor);
          h.id = anchor;
        }
      });
    }
    let rafId: number | null = null;
    function schedule() {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        doSync();
      });
    }
    doSync();
    const observer = new MutationObserver(schedule);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Tick every second to update "X ago" display
  useEffect(() => {
    if (!savedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [savedAt]);
  void tick;

  // ── Save logic ─────────────────────────────────────────────────────────────

  const doSave = useCallback(async (): Promise<void> => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const raw = markdownRef.current;
      const content = transformBeforeSaveRef.current ? transformBeforeSaveRef.current(raw) : raw;
      const username = localStorage.getItem('mindbase-username') ?? '';
      // TODO(v2): LivePreviewEditor is called with a bare slug — default to
      // research per Phase E convention. When callers pass {category, path}
      // explicitly, thread them through Props like WikiEditor does.
      const res = await fetch(`/api/tree/research/${slug}.md`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-mindbase-user': username },
        body: JSON.stringify({ body: content }),
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
  }, [slug]);

  const scheduleAutosave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void doSave(); }, 2000);
  }, [doSave]);

  // ── Markdown change handler ─────────────────────────────────────────────────

  const handleMarkdownChange = useCallback(
    (md: string) => {
      markdownRef.current = md;
      onMarkdownChangeRef.current?.(md);
      scheduleAutosave();
      checkSlashTrigger(md);
      checkWikilinkTrigger(md);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheduleAutosave],
  );

  // ── Slash menu detection ────────────────────────────────────────────────────

  function checkSlashTrigger(_md: string) {
    if (!editorRef.current) return;
    try {
      editorRef.current.action((ctx) => {
        const { editorViewCtx } = require('@milkdown/kit/core') as typeof import('@milkdown/kit/core');
        const view = ctx.get(editorViewCtx) as ProseMirrorView;
        const { state } = view;
        const { from } = state.selection;
        const lineStart = state.doc.resolve(from).start();
        const offset = from - lineStart;
        const lineNode = state.doc.resolve(from).parent;
        const text = lineNode.textContent.slice(0, offset);
        const m = text.match(/^\/([^/\n]*)$/);
        if (m) {
          const coords = view.coordsAtPos(from);
          if (coords) {
            const top = Math.min(coords.bottom + 4, window.innerHeight - 4);
            setSlashMenuState({ pos: { top, left: coords.left }, query: m[1] ?? '' });
          }
        } else {
          setSlashMenuState(null);
        }
      });
    } catch {
      // editor may not be ready yet
    }
  }

  // ── Wikilink autocomplete detection ────────────────────────────────────────

  function checkWikilinkTrigger(_md: string) {
    if (!editorRef.current) return;
    try {
      editorRef.current.action((ctx) => {
        const { editorViewCtx } = require('@milkdown/kit/core') as typeof import('@milkdown/kit/core');
        const view = ctx.get(editorViewCtx) as ProseMirrorView;
        const { state } = view;
        const { from } = state.selection;
        const lineStart = state.doc.resolve(from).start();
        const offset = from - lineStart;
        const lineNode = state.doc.resolve(from).parent;
        const text = lineNode.textContent.slice(0, offset);
        const m = text.match(/\[\[([^\]\n]*)$/);
        if (m) {
          const query = (m[1] ?? '').toLowerCase();
          const coords = view.coordsAtPos(from);
          if (coords) {
            fetchWikiSlugs().then((all) => {
              const filtered = all
                .filter((p) => p.slug.includes(query) || p.title.toLowerCase().includes(query))
                .slice(0, 12);
              if (filtered.length > 0) {
                setWikilinkAC({
                  pos: { top: Math.min(coords.bottom + 4, window.innerHeight - 4), left: coords.left },
                  query,
                  results: filtered,
                });
              } else {
                setWikilinkAC(null);
              }
            });
          }
        } else {
          setWikilinkAC(null);
        }
      });
    } catch {
      // ignore
    }
  }

  // ── AI commands ─────────────────────────────────────────────────────────────

  async function runAI(
    kind: 'continue' | 'summarize' | 'expand' | 'translate',
    opts?: { selectionText?: string; replaceRange?: { from: number; to: number } },
  ) {
    if (!editorRef.current) return;

    // Only do the "/…" slash-removal when called from the slash menu (no explicit selection passed in).
    if (!opts?.selectionText) {
      try {
        editorRef.current.action((ctx) => {
          const { editorViewCtx } = require('@milkdown/kit/core') as typeof import('@milkdown/kit/core');
          const view = ctx.get(editorViewCtx) as ProseMirrorView;
          const { state } = view;
          const { from } = state.selection;
          const lineStart = state.doc.resolve(from).start();
          const lineNode = state.doc.resolve(from).parent;
          const offset = from - lineStart;
          const text = lineNode.textContent.slice(0, offset);
          if (text.match(/^\/[^\n]*$/)) {
            const tr = state.tr.delete(lineStart, from);
            view.dispatch(tr);
          }
        });
      } catch { /* ignore */ }
    }

    // Determine prompt text.
    let promptText = opts?.selectionText ?? '';
    if (!promptText) {
      try {
        editorRef.current.action((ctx) => {
          const { editorViewCtx } = require('@milkdown/kit/core') as typeof import('@milkdown/kit/core');
          const view = ctx.get(editorViewCtx) as ProseMirrorView;
          const { state } = view;
          const { from, to } = state.selection;
          if (from !== to) {
            promptText = state.doc.textBetween(from, to, '\n');
          } else if (kind === 'continue') {
            const head = state.selection.from;
            promptText = state.doc.textBetween(Math.max(0, head - 1500), head, '\n');
          } else {
            const lineNode = state.doc.resolve(from).parent;
            promptText = lineNode.textContent;
          }
        });
      } catch { /* ignore */ }
    }

    if (!promptText.trim()) {
      setError('Select some text or position cursor in a paragraph first.');
      return;
    }

    // TODO(v2): migrate /api/wiki/ai-complete to /api/tree/ai-complete and
    // restore streaming completion. Route was removed with wiki.ts in Phase C;
    // disable gracefully so the slash menu + bubble menu don't 404.
    void promptText;
    void opts;
    setError(`AI ${kind} is disabled during the v2 tree migration.`);
    setAiInProgress(false);
  }

  // ── Slash command execution in Milkdown ─────────────────────────────────────

  function executeSlashCommand(label: string) {
    if (!editorRef.current) return;
    const cmd = SLASH_COMMANDS.find((c) => c.label === label);
    if (!cmd) return;

    if (cmd.ai) {
      void runAI(cmd.ai);
      return;
    }

    // Get the snippet from slashCommands.ts by simulating a CodeMirror call
    // We replicate the logic here: find the "/..." text and replace with snippet.
    try {
      editorRef.current.action((ctx) => {
        const { editorViewCtx } = require('@milkdown/kit/core') as typeof import('@milkdown/kit/core');
        const view = ctx.get(editorViewCtx) as ProseMirrorView;
        const { state } = view;
        const { from } = state.selection;
        const lineStart = state.doc.resolve(from).start();
        const lineNode = state.doc.resolve(from).parent;
        const offset = from - lineStart;
        const text = lineNode.textContent.slice(0, offset);

        // Find the slash position in absolute doc coords
        const slashOffset = text.lastIndexOf('/');
        const slashDocPos = lineStart + (slashOffset >= 0 ? slashOffset : offset);

        // Get the snippet by calling a fake EditorView
        let snippet = '';
        let cursorOffset: number | undefined;

        // Map commands to snippets directly (avoids faking EditorView)
        const snippetMap: Record<string, { text: string; cursor?: number }> = {
          'Heading 1':    { text: '# ' },
          'Heading 2':    { text: '## ' },
          'Heading 3':    { text: '### ' },
          'Bullet list':  { text: '- ' },
          'Numbered list':{ text: '1. ' },
          'Checkbox':     { text: '- [ ] ' },
          'Quote':        { text: '> ' },
          'Divider':      { text: '\n---\n\n' },
          'Code block':   { text: '```\n\n```\n', cursor: 4 },
          'Callout':      { text: '> [!note]\n> ', cursor: 12 },
          'Wikilink':     { text: '[[', cursor: 2 },
          'External link':{ text: '[](url)', cursor: 1 },
          'Daily note':   { text: `# ${new Date().toISOString().slice(0, 10)}\n\n## What I did\n\n## What I learned\n\n## Tomorrow\n\n` },
          'Meeting note': { text: `# Meeting · ${new Date().toLocaleDateString()}\n\n**Attendees**: \n\n## Agenda\n\n- \n\n## Notes\n\n## Decisions\n\n## Action items\n\n- [ ] \n` },
          'Person profile':{ text: `# Person Name\n\n**Role**: \n**Connected via**: \n\n## Background\n\n## Notable conversations\n\n## Threads to follow up\n\n` },
        };

        const entry = snippetMap[label];
        if (!entry) return;
        snippet = entry.text;
        cursorOffset = entry.cursor;

        // Delete "/" + query, insert snippet
        const tr = state.tr.delete(slashDocPos, from).insertText(snippet, slashDocPos);
        const newPos = slashDocPos + (cursorOffset ?? snippet.length);
        view.dispatch(tr.setSelection(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (state.selection.constructor as any).near(tr.doc.resolve(Math.min(newPos, tr.doc.content.size)))
        ));
      });
    } catch (e) {
      console.error('[LivePreviewEditor] slash command failed:', e);
    }
  }

  // ── Insert wikilink from autocomplete ──────────────────────────────────────

  function insertWikilink(item: { slug: string; title: string }) {
    if (!editorRef.current) return;
    try {
      editorRef.current.action((ctx) => {
        const { editorViewCtx } = require('@milkdown/kit/core') as typeof import('@milkdown/kit/core');
        const view = ctx.get(editorViewCtx) as ProseMirrorView;
        const { state } = view;
        const { from } = state.selection;
        const lineStart = state.doc.resolve(from).start();
        const offset = from - lineStart;
        const lineNode = state.doc.resolve(from).parent;
        const text = lineNode.textContent.slice(0, offset);
        const m = text.match(/\[\[([^\]\n]*)$/);
        if (!m) return;
        const openBracketDocPos = lineStart + offset - m[0].length;
        const insert = `[[${item.slug}]]`;
        const tr = state.tr.delete(openBracketDocPos, from).insertText(insert, openBracketDocPos);
        view.dispatch(tr);
      });
    } catch { /* ignore */ }
    setWikilinkAC(null);
  }

  // ── Keyboard shortcut: ⌘+S and ⌘+/ ────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void doSave();
      }
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onModeChange('source');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doSave, onModeChange]);

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  const ago = savedAt ? Math.round((Date.now() - savedAt.getTime()) / 1000) : null;

  // Fake EditorView-compatible object to satisfy SlashMenu's `view` prop
  // SlashMenu only uses `view` for CodeMirror operations on non-AI commands,
  // but we intercept those via executeSlashCommand. We still pass a no-op object
  // because SlashMenu's type requires it.
  const fakeView = { state: { doc: { toString: () => markdownRef.current } } } as unknown as import('@codemirror/view').EditorView;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--surface-0)' }}>
      {/* Toolbar — suppressed when parent provides its own chrome (NotePane). */}
      {!hideToolbar && (
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
              : 'type / for commands · [[ for wikilinks · ⌘S to save'}
        </div>
        {aiInProgress && (
          <div className="text-[11px]" style={{ color: 'var(--accent-amber)' }}>
            AI thinking…
          </div>
        )}
        {/* Mode toggle */}
        <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            className="px-3 py-1 text-[12px] cursor-pointer"
            style={{ background: 'var(--accent-azure)', color: 'white', border: 'none', borderRight: '1px solid var(--border)' }}
            title="Live Preview (active)"
            disabled
          >
            👁 Preview
          </button>
          <button
            onClick={() => onModeChange('source')}
            className="px-3 py-1 text-[12px] cursor-pointer"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: 'none' }}
            title="Source mode (⌘+/)"
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
            void doSave().then(() => onSave(markdownRef.current));
          }}
          className="px-3 py-1 text-[12px] rounded cursor-pointer"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-default)' }}
        >
          Done
        </button>
      </div>
      )}

      {/* Error banner */}
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

      {/* Milkdown editor */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-7 py-4">
        <MilkdownProvider>
          <MilkdownInner
            initialContent={initialContent}
            slug={slug}
            onMarkdownChange={handleMarkdownChange}
            onEditorReady={(editor) => {
              editorRef.current = editor;
              try {
                editor.action((ctx) => {
                  const { editorViewCtx } = require('@milkdown/kit/core') as typeof import('@milkdown/kit/core');
                  setPmView(ctx.get(editorViewCtx));
                });
              } catch { /* editor may not expose view yet */ }
            }}
            onWikilinkHover={scheduleShow}
            onWikilinkHoverOut={() => scheduleHide(180)}
            onWikilinkClick={(target, modifiers) => {
              // Navigate via parent — App.tsx intercepts the event and routes
              // to article/raw/note. Cmd/Ctrl click opens in a new page tab.
              const newTab = modifiers.meta || modifiers.ctrl;
              const event = new CustomEvent('milkdown:wikilink-click', {
                detail: { slug: target, newTab },
                bubbles: true,
              });
              document.dispatchEvent(event);
            }}
          />
        </MilkdownProvider>
      </div>

      {/* Wikilink hover popover. Mouse enter/leave on the popover itself
          is what makes the chip→popover handoff work — without it, the
          popover would close the moment the cursor crosses the 8px gap. */}
      {hoverSlug && hoverEl && (
        <WikilinkPopover
          slug={hoverSlug}
          anchorEl={hoverEl}
          onClose={() => { clearShowTimer(); clearHideTimer(); setHoverSlug(null); setHoverEl(null); }}
          onOpen={(s) => {
            clearShowTimer(); clearHideTimer();
            setHoverSlug(null); setHoverEl(null);
            const event = new CustomEvent('milkdown:wikilink-click', { detail: { slug: s }, bubbles: true });
            document.dispatchEvent(event);
          }}
          onPointerEnter={() => clearHideTimer()}
          onPointerLeave={() => scheduleHide(0)}
        />
      )}

      {/* Slash command menu */}
      {slashMenuState && (
        <SlashMenu
          view={fakeView}
          pos={slashMenuState.pos}
          query={slashMenuState.query}
          onClose={() => setSlashMenuState(null)}
          onAI={(kind) => { void runAI(kind); }}
          onExecute={(label) => {
            executeSlashCommand(label);
            setSlashMenuState(null);
          }}
        />
      )}

      {/* Wikilink autocomplete dropdown */}
      {wikilinkAC && wikilinkAC.results.length > 0 && (
        <div
          className="fixed z-50 rounded-lg shadow-2xl"
          style={{
            top: wikilinkAC.pos.top,
            left: wikilinkAC.pos.left,
            width: 280,
            maxHeight: 240,
            overflowY: 'auto',
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            padding: 4,
            fontSize: 13,
          }}
        >
          {wikilinkAC.results.map((item) => (
            <button
              key={item.slug}
              onClick={() => insertWikilink(item)}
              className="w-full text-left px-3 py-1.5 rounded"
              style={{
                background: 'transparent',
                color: 'var(--text-default)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{item.title}</span>
              <span className="text-[11px]" style={{ color: 'var(--text-low)' }}>{item.slug}</span>
            </button>
          ))}
        </div>
      )}

      {/* AI selection bubble menu */}
      <AIBubbleMenu
        view={pmView as never}
        containerEl={containerRef.current}
        busy={aiInProgress}
        onAction={(kind, { selectionText, from, to }) => {
          void runAI(kind, { selectionText, replaceRange: { from, to } });
        }}
      />
    </div>
  );
}
