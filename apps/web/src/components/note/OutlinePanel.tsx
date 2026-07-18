import { useMemo } from 'react';
import { parseOutline, type OutlineHeading } from '../../lib/outline';

interface Props {
  /** Live markdown body of the current note. */
  markdown: string;
}

function jumpTo(anchor: string) {
  const el = document.querySelector(`[data-heading-id="${CSS.escape(anchor)}"]`);
  if (el && el instanceof HTMLElement) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderHeading(h: OutlineHeading): React.ReactNode {
  return (
    <div key={h.anchor}>
      <button
        onClick={() => jumpTo(h.anchor)}
        className="w-full text-left px-2 py-0.5 rounded cursor-pointer truncate"
        style={{
          paddingLeft: 8 + (h.level - 1) * 10,
          color: 'var(--text-default)',
          fontSize: '11.5px',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        data-testid="outline-item"
      >
        {h.text}
      </button>
      {h.children.map(renderHeading)}
    </div>
  );
}

function flatten(level: OutlineHeading[]): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  for (const h of level) {
    out.push(h);
    out.push(...flatten(h.children));
  }
  return out;
}

/** Public helper so the tab strip can show a count without rendering the panel. */
export function outlineCount(markdown: string): number {
  return flatten(parseOutline(markdown)).length;
}

export function OutlinePanel({ markdown }: Props) {
  const headings = useMemo(() => parseOutline(markdown), [markdown]);

  if (headings.length === 0) {
    return (
      <div className="text-[11px] px-2 py-1" style={{ color: 'var(--text-faint)' }}>
        No headings yet.
      </div>
    );
  }

  return (
    <div data-testid="outline-panel">
      {headings.map(renderHeading)}
    </div>
  );
}
