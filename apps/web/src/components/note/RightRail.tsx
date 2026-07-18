import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useShellState } from '../../store/shell-state';

export interface RightRailTab {
  id: string;
  label: string;
  /** Optional count badge to render next to the label. */
  count?: number;
  /** Rendered when this tab is active. Lazy via callback so inactive tabs don't fetch. */
  render(): ReactNode;
}

interface Props {
  tabs: RightRailTab[];
  /** Which tab id to show by default. */
  defaultTab?: string;
}

/**
 * 260px right-rail container with tabbed content. Only the active tab's body
 * is rendered — keeps Outline/Backlinks from competing for vertical space.
 * On screens ≥1280px renders inline as a flex sibling; below that it becomes
 * a slide-over drawer anchored to the right edge of the viewport.
 * The open/close toggle lives in CanvasToolbar.
 */
export function RightRail({ tabs, defaultTab }: Props) {
  const open = useShellState((s) => s.rightRailOpen);
  const toggleRightRail = useShellState((s) => s.toggleRightRail);
  const railWidth = useShellState((s) => s.rightRailWidth);
  const setRailWidth = useShellState((s) => s.setRightRailWidth);
  const [activeId, setActiveId] = useState<string>(defaultTab ?? tabs[0]?.id ?? '');

  // Drag-resize logic — handle on the LEFT edge (between Canvas and RightRail).
  // Dragging LEFT (negative dx) makes the rail WIDER.
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(railWidth);
  function onMove(e: MouseEvent) {
    if (!dragging.current) return;
    setRailWidth(startW.current - (e.clientX - startX.current));
  }
  function onUp() {
    dragging.current = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
  useEffect(() => () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }, []);
  function startResize(e: React.MouseEvent) {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = railWidth;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  if (!open || tabs.length === 0) return null;
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]!;

  const body = (
    <>
      {/* Tab strip */}
      <div
        className="flex items-center gap-0 px-2 pt-3 pb-2 shrink-0"
        style={{ borderBottom: '0.5px solid var(--hairline)' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveId(tab.id)}
            className="text-[11.5px] px-2 py-1 rounded cursor-pointer flex items-center gap-1"
            style={{
              background: 'transparent',
              border: 'none',
              color: active.id === tab.id ? 'var(--text-high)' : 'var(--text-mid)',
              fontWeight: active.id === tab.id ? 600 : 400,
              borderBottom: active.id === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab.label}
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span
                className="text-[10px] px-1 rounded"
                style={{ background: 'var(--bg-3)', color: 'var(--text-faint)' }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {/* Active tab content */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {active.render()}
      </div>
    </>
  );

  return (
    <>
      {/* Inline rail (≥1280px) */}
      <aside
        className="hidden xl:flex flex-col relative"
        style={{
          width: railWidth,
          flexShrink: 0,
          borderLeft: '0.5px solid var(--hairline)',
        }}
        data-testid="rightrail-inline"
      >
        {/* Drag-resize handle on left edge, invisible until hover */}
        <div
          className="absolute top-0 bottom-0 cursor-col-resize z-10 group/resize"
          style={{ left: -3, width: 6 }}
          onMouseDown={startResize}
          data-testid="rightrail-resize-handle"
        >
          <div
            className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 transition-opacity opacity-0 group-hover/resize:opacity-100"
            style={{ width: 2, background: 'var(--accent)' }}
          />
        </div>
        {body}
      </aside>

      {/* Slide-over drawer (<1280px) */}
      <div
        className="xl:hidden fixed inset-0 z-40 flex justify-end"
        onClick={toggleRightRail}
        data-testid="rightrail-drawer-backdrop"
      >
        <div
          className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.3)' }}
        />
        <aside
          className="relative w-[280px] h-full flex flex-col"
          style={{
            background: 'var(--win-bg)',
            borderLeft: '0.5px solid var(--hairline)',
            boxShadow: '-8px 0 24px rgba(0,0,0,0.10)',
          }}
          onClick={(e) => e.stopPropagation()}
          data-testid="rightrail-drawer"
        >
          {body}
        </aside>
      </div>
    </>
  );
}
