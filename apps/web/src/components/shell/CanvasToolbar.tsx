import { ChevronLeft, ChevronRight, Pin, PanelRight } from 'lucide-react';
import { useCanvasRoute, type CanvasRoute } from '../../store/canvas-route';
import { useShellState } from '../../store/shell-state';

interface CanvasToolbarProps {
  breadcrumb: { segments: { label: string; leaf?: boolean }[] };
  mode?: 'read' | 'edit' | 'graph';
  onModeChange?: (m: 'read' | 'edit' | 'graph') => void;
  modeOptions?: ('read' | 'edit' | 'graph')[];
}

export function CanvasToolbar({ breadcrumb, mode, onModeChange, modeOptions }: CanvasToolbarProps) {
  const back = useCanvasRoute((s) => s.back);
  const forward = useCanvasRoute((s) => s.forward);
  const canBack = useCanvasRoute((s) => s.canBack());
  const canForward = useCanvasRoute((s) => s.canForward());
  const pinned = useCanvasRoute((s) => s.pinned);
  const togglePin = useCanvasRoute((s) => s.togglePin);
  const rightRailOpen = useShellState((s) => s.rightRailOpen);
  const toggleRightRail = useShellState((s) => s.toggleRightRail);

  return (
    <div
      className="flex-shrink-0 h-[38px] flex items-center px-4 gap-1.5"
      style={{
        background: 'var(--toolbar-bg)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '0.5px solid var(--hairline)',
      }}
      data-testid="canvas-toolbar"
    >
      <NavBtn disabled={!canBack} onClick={back} data-testid="canvas-back">
        <ChevronLeft size={14} strokeWidth={1.8} />
      </NavBtn>
      <NavBtn disabled={!canForward} onClick={forward} data-testid="canvas-forward">
        <ChevronRight size={14} strokeWidth={1.8} />
      </NavBtn>

      <div
        className="flex-1 truncate"
        style={{ fontSize: '12.5px', color: 'var(--text-default)', fontWeight: 500 }}
        data-testid="canvas-breadcrumb"
      >
        {breadcrumb.segments.map((seg, i) => (
          <span key={i}>
            {i > 0 && <span style={{ color: 'var(--text-faint)', margin: '0 6px' }}>›</span>}
            <span
              style={{
                color: seg.leaf ? 'var(--text-high)' : 'var(--text-default)',
                fontWeight: seg.leaf ? 600 : 500,
              }}
            >
              {seg.label}
            </span>
          </span>
        ))}
      </div>

      {modeOptions && mode && onModeChange && (
        <div
          className="flex p-0.5 rounded-md"
          style={{ background: 'var(--bg-2)' }}
          data-testid="canvas-mode-toggle"
        >
          {modeOptions.map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className="px-2.5 py-0.5 rounded text-[11px] cursor-pointer"
              style={{
                background: mode === m ? 'var(--win-bg)' : 'transparent',
                color: mode === m ? 'var(--text-high)' : 'var(--text-mid)',
                fontWeight: mode === m ? 600 : 500,
                boxShadow: mode === m ? '0 0.5px 1px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {m === 'read' ? 'Read' : m === 'edit' ? 'Edit' : 'Graph'}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={toggleRightRail}
        className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer"
        style={{
          color: rightRailOpen ? 'var(--accent)' : 'var(--text-mid)',
          background: 'transparent',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title={rightRailOpen ? 'Hide panels' : 'Show panels (Outline · Backlinks)'}
        data-testid="canvas-rightrail-toggle"
      >
        <PanelRight size={14} strokeWidth={1.8} />
      </button>
      <button
        onClick={togglePin}
        className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer"
        style={{
          color: pinned ? 'var(--accent)' : 'var(--text-mid)',
          background: 'transparent',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title={pinned ? 'Unpin canvas' : 'Pin canvas (lock to current view)'}
        data-testid="canvas-pin"
      >
        <Pin size={14} strokeWidth={1.8} fill={pinned ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

function NavBtn({
  disabled,
  onClick,
  children,
  ...rest
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className="w-[26px] h-[26px] flex items-center justify-center rounded-md cursor-pointer"
      style={{
        color: disabled ? 'var(--text-faint)' : 'var(--text-mid)',
        cursor: disabled ? 'default' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--row-hover)';
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.background = 'transparent';
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// Breadcrumb derivation helper used by Canvas.tsx. Co-located here so the
// shape stays in lockstep with the toolbar's interface.
// `opts.noteTitle` lets the caller pass a cached human title for note routes
// so the breadcrumb shows "Notes › Mindbase development journey" instead of
// the raw slug ("Notes › untitled-…-1234").
export function breadcrumbFor(
  route: CanvasRoute,
  opts?: { noteTitle?: string },
): { segments: { label: string; leaf?: boolean }[] } {
  switch (route.kind) {
    case 'home': return { segments: [{ label: 'Wiki', leaf: true }] };
    case 'dashboard': return { segments: [{ label: 'Dashboard', leaf: true }] };
    case 'graph': return { segments: [{ label: 'Graph', leaf: true }] };
    case 'stream': return { segments: [{ label: 'Stream', leaf: true }] };
    case 'review': return { segments: [{ label: 'Review', leaf: true }] };
    case 'settings': return { segments: [{ label: 'Settings', leaf: true }] };
    case 'inbox': return { segments: [{ label: 'Inbox', leaf: true }] };
    case 'health': return { segments: [{ label: 'Wiki Health', leaf: true }] };
    case 'devices': return { segments: [{ label: 'Devices', leaf: true }] };
    case 'ingest': return { segments: [{ label: 'Ingest', leaf: true }] };
    case 'article': return { segments: [{ label: 'Wiki' }, { label: route.slug, leaf: true }] };
    case 'note': return { segments: [{ label: 'Notes' }, { label: opts?.noteTitle || route.slug, leaf: true }] };
    case 'raw': return { segments: [{ label: 'Raw' }, { label: route.rawId, leaf: true }] };
    case 'audit-log': return { segments: [{ label: 'Compile history', leaf: true }] };
    case 'audit-log-detail': return { segments: [{ label: 'Compile history' }, { label: `#${route.id}`, leaf: true }] };
    case 'trash': return { segments: [{ label: 'Trash', leaf: true }] };
    case 'compile-progress': return { segments: [{ label: 'Compile' }, { label: route.sourceSlug, leaf: true }] };
  }
}
