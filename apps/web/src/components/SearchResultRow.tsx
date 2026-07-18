import type { HybridResult, SnippetResult } from '../lib/search';
import { relativeTime } from '../lib/time-buckets';

/**
 * Render a snippet with highlighted match ranges bolded.
 */
function HighlightedSnippet({ text, highlights }: SnippetResult) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of highlights) {
    if (cursor < start) parts.push(text.slice(cursor, start));
    parts.push(
      <strong key={start} style={{ color: 'var(--accent)', fontWeight: 600 }}>
        {text.slice(start, end)}
      </strong>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return (
    <span style={{ color: 'var(--text-low)', fontSize: 11, lineHeight: 1.5 }}>
      "{parts}"
    </span>
  );
}

interface Props {
  result: HybridResult;
  isActive: boolean;
  index: number; // 0-based
  onOpen: (slug: string, path: string) => void;
  onMouseEnter: () => void;
}

export function SearchResultRow({ result, isActive, index, onOpen, onMouseEnter }: Props) {
  const shortcutKey = index < 9 ? `⌘${index + 1}` : undefined;

  return (
    <button
      onClick={() => onOpen(result.slug, result.path)}
      onMouseEnter={onMouseEnter}
      className="w-full text-left px-4 py-2.5"
      style={{
        background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      {/* Title row */}
      <div className="flex items-center gap-2 mb-0.5">
        <div className="flex-1 text-[13px] font-medium truncate" style={{ color: 'var(--text-high)' }}>
          {result.title}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {shortcutKey && (
            <span
              className="text-[9px] px-1 py-0.5 rounded font-mono"
              style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}
            >
              {shortcutKey}
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            {Math.round(result.score * 1000) / 10}
          </span>
        </div>
      </div>

      {/* Snippet */}
      {result.snippet.text && (
        <div className="mb-0.5 line-clamp-2">
          <HighlightedSnippet text={result.snippet.text} highlights={result.snippet.highlights} />
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-faint)' }}>
        {result.type && <span>{result.type}</span>}
        {result.tags && result.tags.length > 0 && (
          <span>{result.tags.slice(0, 3).join(', ')}</span>
        )}
        {result.updated && (
          <span>{relativeTime(result.updated)}</span>
        )}
        {result.bm25_rank !== null && result.vec_rank !== null && (
          <span style={{ color: 'var(--text-faint)' }}>hybrid</span>
        )}
      </div>
    </button>
  );
}
