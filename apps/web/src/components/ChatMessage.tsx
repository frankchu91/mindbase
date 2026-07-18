import { useState } from 'react';
import type React from 'react';
import { Sparkles, Check, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { ExtraProps } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import type { ChatMessage as Msg, CitedSource } from '../store/chat';
import { apiPost } from '../lib/api';
import { FileBackModal } from './chat/FileBackModal';

// Inlined from @mindbase/core to keep the web bundle free of Node-only modules
// (FeedStore/CardStore in core top-level-import node:fs).
const AUTO_SAVE_REGEX = /\[AUTO_SAVE:\s*(.+?)\]\s*$/;

/** Strip the [AUTO_SAVE: ...] marker from display text */
function cleanText(text: string): string {
  return text.replace(AUTO_SAVE_REGEX, '').trimEnd();
}

/**
 * Pre-process answer text: replace [N] citation markers with <cite data-n="N"></cite>
 * so rehype-raw can parse them and our custom component can render them as buttons.
 */
function injectCiteElements(text: string): string {
  return text.replace(/\[(\d+)\]/g, (_, n) => `<cite data-n="${n}"></cite>`);
}

export function ChatMessage({
  msg,
  onWikiSaved,
  autoSaveTitle,
  onOpenArticle,
}: {
  msg: Msg;
  onWikiSaved?: () => void;
  autoSaveTitle?: string | null;
  onOpenArticle?: (slug: string, path: string) => void;
}) {
  const isUser = msg.role === 'user';
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileBackOpen, setFileBackOpen] = useState(false);
  const [fileBackedSlug, setFileBackedSlug] = useState<string | null>(null);

  const displayText = !isUser ? cleanText(msg.text) : msg.text;

  const sourceMap = new Map<number, CitedSource>(
    (msg.sources ?? []).map((s) => [s.n, s]),
  );

  async function saveToWiki() {
    if (saving || saved) return;
    setSaving(true);
    try {
      const clean = cleanText(msg.text);
      // Let the server generate a smart title via LLM
      await apiPost('/wiki/file', { content: clean });
      setSaved(true);
      onWikiSaved?.();
    } catch (e) {
      console.error('Failed to save:', e);
    } finally {
      setSaving(false);
    }
  }

  // Build ReactMarkdown components prop with a custom cite handler.
  // <cite> is a real HTML element so it's valid in react-markdown's Components map;
  // we use ExtraProps for the node field and cast props to access data-n.
  const markdownComponents = {
    cite: ({ node: _node, ...props }: React.HTMLAttributes<HTMLElement> & ExtraProps) => {
      const rawN = (props as React.HTMLAttributes<HTMLElement> & { 'data-n'?: string })['data-n'];
      const n = typeof rawN === 'string' ? parseInt(rawN, 10) : NaN;
      if (isNaN(n)) return null;
      const src = sourceMap.get(n);
      if (!src) {
        return (
          <sup style={{ fontSize: '0.7em', lineHeight: 1 }}>
            [{n}]
          </sup>
        );
      }
      return (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenArticle?.(src.slug, src.path);
          }}
          title={`${src.title}${src.one_liner ? ` — ${src.one_liner}` : ''}`}
          style={{
            fontSize: '0.7em',
            verticalAlign: 'super',
            lineHeight: 1,
            color: 'var(--accent-amber)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0 1px',
            margin: '0 1px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          [{n}]
        </button>
      );
    },
  };

  // For assistant messages with sources, inject cite elements so they become clickable
  const processedText =
    !isUser && sourceMap.size > 0
      ? injectCiteElements(displayText || (msg.status === 'streaming' ? '...' : ''))
      : displayText || (msg.status === 'streaming' ? '...' : '');

  const useRehypeRaw = !isUser && sourceMap.size > 0;

  return (
    <div className={`mb-4 ${isUser ? 'flex justify-end' : ''}`}>
      <div
        className={`max-w-[80%] px-4 py-3 text-[13px] leading-[1.65] ${isUser ? '' : 'glass-card'}`}
        style={{
          background: isUser ? 'rgba(255,255,255,0.94)' : 'var(--surface-1)',
          color: isUser ? 'var(--text-inverse)' : 'var(--text-default)',
          borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
          border: isUser ? 'none' : '1px solid var(--border-default)',
        }}
      >
        {msg.status === 'streaming' && msg.progress && msg.progress.length > 0 && (
          <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            {msg.progress.map((p, i) => (
              <div key={i}>· {p}</div>
            ))}
          </div>
        )}
        <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : ''}`}>
          {useRehypeRaw ? (
            <ReactMarkdown
              rehypePlugins={[rehypeRaw]}
              components={markdownComponents}
            >
              {processedText}
            </ReactMarkdown>
          ) : (
            <ReactMarkdown>{processedText}</ReactMarkdown>
          )}
        </div>
        {msg.status === 'error' && (
          <div className="mt-2 text-xs" style={{ color: 'var(--error)' }}>Error: {msg.error}</div>
        )}
        {msg.citations && msg.citations.length > 0 && (
          <div className="mt-3 pt-3 text-[10.5px] flex flex-col gap-1" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-mid)' }}>
            {msg.citations.map((c, i) => {
              const src = msg.sources?.find((s) => s.path === c.path);
              const n = src?.n ?? i + 1;
              return (
                <div key={i}>
                  <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>[{n}]</span>{' '}
                  {src ? (
                    <button
                      onClick={() => onOpenArticle?.(src.slug, src.path)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-default)',
                        padding: 0,
                        fontWeight: 500,
                        textDecoration: 'underline',
                        textUnderlineOffset: '2px',
                      }}
                    >
                      {c.title}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-default)' }}>{c.title}</span>
                  )}{' '}
                  <span style={{ color: 'var(--text-low)' }}>· {c.path}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Auto-save notification */}
        {autoSaveTitle && (
          <div className="mt-3 text-[11px] flex items-center gap-2" style={{ color: 'var(--accent)' }}>
            <Sparkles size={12} strokeWidth={1.8} />
            <span>Saved as <span style={{ fontWeight: 600 }}>"{autoSaveTitle}"</span></span>
          </div>
        )}

        {/* Manual save + file-back buttons — always available on assistant done messages */}
        {!isUser && msg.status === 'done' && msg.text && !msg.text.startsWith('Ingested') && (
          <div className="mt-2 pt-2 flex items-center gap-2" style={{ borderTop: '1px solid var(--border)' }}>
            {saved ? (
              <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                <Check size={12} strokeWidth={2} />
                Saved to Knowledge
              </span>
            ) : (
              <button
                onClick={saveToWiki}
                disabled={saving}
                className="text-xs px-2 py-1 rounded transition-colors disabled:opacity-50"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                {saving ? 'Saving...' : 'Save to Knowledge'}
              </button>
            )}
            {fileBackedSlug ? (
              <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                <FileText size={12} strokeWidth={2} />
                Filed back as <code>{fileBackedSlug}</code>
              </span>
            ) : (
              <button
                onClick={() => setFileBackOpen(true)}
                className="text-xs px-2 py-1 rounded transition-colors inline-flex items-center gap-1.5"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                title="Preview the synthesized note + add reciprocal back-links from cited pages"
              >
                <FileText size={11} strokeWidth={2} /> File back as note…
              </button>
            )}
          </div>
        )}
      </div>
      <FileBackModal
        open={fileBackOpen}
        question={findUserQuestion(msg)}
        answer={cleanText(msg.text)}
        sourceSlugs={(msg.sources ?? []).map((s) => s.slug).filter(Boolean)}
        onClose={() => setFileBackOpen(false)}
        onSaved={(slug) => {
          setFileBackedSlug(slug);
          onWikiSaved?.();
        }}
      />
    </div>
  );
}

/**
 * The file-back modal needs the user's prior question as the note title.
 * The chat store stores messages flat; we use the message's `prompt` field
 * if present, otherwise fall back to the first line of the message text.
 */
function findUserQuestion(msg: Msg): string {
  const m = msg as Msg & { prompt?: string };
  if (typeof m.prompt === 'string' && m.prompt.trim()) return m.prompt.trim();
  const firstLine = (m.text ?? '').split('\n').find((l) => l.trim().length > 0);
  return firstLine ?? 'Filed answer';
}
