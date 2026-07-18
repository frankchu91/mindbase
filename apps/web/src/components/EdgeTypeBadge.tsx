import type { EdgeType } from '@mindbase/core';

interface EdgeTypeStyle {
  label: string;
  color: string;             // primary color used by graphs + badge fill
  dashed: boolean;           // dashed stroke for "weaker" / "questioning" relationships
  weight: number;            // line weight multiplier (1.0 = default)
}

const STYLE: Record<EdgeType, EdgeTypeStyle> = {
  mentions:    { label: 'mentions',    color: '#94a3b8', dashed: false, weight: 1.0 },
  elaborates:  { label: 'elaborates',  color: '#60a5fa', dashed: false, weight: 1.2 },
  cites:       { label: 'cites',       color: '#34d399', dashed: false, weight: 1.0 },
  contradicts: { label: 'contradicts', color: '#ef4444', dashed: true,  weight: 1.2 },
  supersedes:  { label: 'supersedes',  color: '#a78bfa', dashed: false, weight: 1.3 },
  is_a:        { label: 'is a',        color: '#fbbf24', dashed: false, weight: 1.4 },
  part_of:     { label: 'part of',     color: '#fb923c', dashed: false, weight: 1.2 },
  example_of:  { label: 'example of',  color: '#06b6d4', dashed: false, weight: 1.0 },
};

export function edgeTypeStyle(type: EdgeType): EdgeTypeStyle {
  return STYLE[type] ?? STYLE.mentions;
}

interface EdgeTypeBadgeProps {
  type: EdgeType;
  size?: 'sm' | 'md';
}

export function EdgeTypeBadge({ type, size = 'sm' }: EdgeTypeBadgeProps) {
  const s = edgeTypeStyle(type);
  const fontSize = size === 'sm' ? 10 : 11;
  const padX = size === 'sm' ? 6 : 8;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: `1px ${padX}px`,
        borderRadius: 999,
        fontSize,
        fontWeight: 600,
        letterSpacing: '0.02em',
        background: `${s.color}22`,        // 13% alpha — soft tint
        color: s.color,
        border: `1px solid ${s.color}55`,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}
