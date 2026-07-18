import { Link2, ExternalLink, FileType } from 'lucide-react';
import { useLiveEdit } from '../../store/live-edit';
import { edgeTypeStyle } from '../EdgeTypeBadge';
import type { EdgeType } from '@mindbase/core';

export interface ProvenanceSource {
  id: string;            // raw doc id (clickable into raw view)
  label: string;         // short label, e.g. filename or domain
  kind?: 'pdf' | 'url' | 'note' | 'chat' | string;
}

interface ProvenanceTrailProps {
  slug: string;
  sources: ProvenanceSource[];
  viaChatId?: string | null;
  viaChatLabel?: string | null;
  onOpenRaw: (id: string) => void;
  onOpenChat?: (id: string) => void;
  typedOutgoing?: Partial<Record<EdgeType, string[]>>;   // edgeType → slug[]
  onOpenSlug?: (slug: string) => void;
}

export function ProvenanceTrail({
  slug,
  sources,
  viaChatId,
  viaChatLabel,
  onOpenRaw,
  onOpenChat,
  typedOutgoing,
  onOpenSlug,
}: ProvenanceTrailProps) {
  const writingTo = useLiveEdit((s) => s.writingTo);
  const isLive = writingTo === slug;

  if (sources.length === 0 && !viaChatId && !isLive) return null;

  const maxChips = 3;
  const shown = sources.slice(0, maxChips);
  const overflow = sources.length - maxChips;

  return (
    <div
      data-testid="provenance-trail"
      className="flex items-center gap-2 flex-wrap mb-5 px-3 py-2 rounded-md"
      style={{
        background: 'var(--bg-2)',
        fontSize: 11.5,
        color: 'var(--text-mid)',
      }}
    >
      <Link2 size={13} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
      <span style={{ fontWeight: 600, color: 'var(--text-default)' }}>
        Compiled from {sources.length} source{sources.length === 1 ? '' : 's'}
      </span>
      {shown.map((s) => (
        <button
          key={s.id}
          onClick={() => onOpenRaw(s.id)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer"
          style={{
            background: 'var(--win-bg)',
            border: '0.5px solid var(--hairline)',
            color: 'var(--text-default)',
            fontWeight: 500,
          }}
        >
          {s.kind === 'pdf' && <FileType size={10} strokeWidth={1.8} />}
          {s.label}
        </button>
      ))}
      {overflow > 0 && (
        <span style={{ color: 'var(--text-faint)' }}>+{overflow} more</span>
      )}
      {viaChatId && (
        <>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <button
            onClick={() => onOpenChat?.(viaChatId)}
            className="inline-flex items-center gap-1 cursor-pointer"
            style={{ color: 'var(--accent)', fontWeight: 500 }}
          >
            via chat {viaChatLabel ?? ''}
            <ExternalLink size={10} strokeWidth={1.8} />
          </button>
        </>
      )}
      {isLive && (
        <>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--live)', fontWeight: 600 }}>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--live)', animation: 'mb-pulse 1.5s ease-in-out infinite' }}
            />
            live
          </span>
        </>
      )}
      {(['contradicts', 'supersedes', 'elaborates'] as const).map((type) => {
        const slugs = typedOutgoing?.[type];
        if (!slugs || slugs.length === 0) return null;
        const style = edgeTypeStyle(type);
        return (
          <div key={type} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            marginTop: 4,
            fontSize: 11.5,
            color: 'var(--text-mid)',
            width: '100%',
          }}>
            <span style={{
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              color: style.color,
              fontSize: 10,
            }}>{style.label}</span>
            {slugs.slice(0, 5).map((s) => (
              <a
                key={s}
                href={`#${s}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (onOpenSlug) onOpenSlug(s);
                }}
                style={{
                  padding: '1px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  background: `${style.color}11`,
                  color: style.color,
                  border: `1px solid ${style.color}44`,
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}
              >
                [[{s}]]
              </a>
            ))}
            {slugs.length > 5 && <span style={{ color: 'var(--text-faint)' }}>+{slugs.length - 5}</span>}
          </div>
        );
      })}
    </div>
  );
}
