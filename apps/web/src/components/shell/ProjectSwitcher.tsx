// apps/web/src/components/shell/ProjectSwitcher.tsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus } from 'lucide-react';
import { useProjects } from '../../store/projects';

export function ProjectSwitcher() {
  const projects = useProjects((s) => s.projects);
  const currentProjectId = useProjects((s) => s.currentProjectId);
  const load = useProjects((s) => s.load);
  const switchTo = useProjects((s) => s.switchTo);

  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent): void {
      // The menu lives in a body portal, so check both the trigger and the menu.
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = projects.find((p) => p.id === currentProjectId);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenuPos({ top: r.bottom + 4, left: r.left });
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[12px]"
        style={{ color: 'var(--text-high)', background: 'transparent' }}
        data-testid="project-switcher-button"
      >
        <span style={{ color: 'var(--text-faint)' }}>Project ·</span>
        <span style={{ fontWeight: 500 }}>{current?.name ?? currentProjectId}</span>
        <ChevronDown size={11} strokeWidth={1.8} style={{ color: 'var(--text-mid)' }} />
      </button>
      {open && menuPos && createPortal(
        <div
          // Body portal: the titlebar creates a stacking context that sits
          // below the sidebar, so even position:fixed z-50 painted underneath
          // it (menu looked "transparent"). Portaling to <body> escapes every
          // ancestor stacking context for both painting and hit-testing.
          ref={menuRef}
          className="fixed rounded-md shadow-lg z-50 min-w-[240px]"
          style={{
            top: menuPos.top,
            left: menuPos.left,
            background: 'var(--win-bg)',
            backdropFilter: 'blur(12px)',
            border: '0.5px solid var(--hairline)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
          }}
        >
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => { setOpen(false); void switchTo(p.id); }}
              className="flex items-center gap-2 w-full text-left px-3 py-2 text-[12px] cursor-pointer"
              style={{
                color: 'var(--text-default)',
                background: p.id === currentProjectId ? 'var(--row-hover)' : 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = p.id === currentProjectId ? 'var(--row-hover)' : 'transparent')}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: p.id === currentProjectId ? 'var(--accent)' : 'var(--hairline)' }} />
              {p.name}
            </button>
          ))}
          <div style={{ borderTop: '0.5px solid var(--hairline)' }} />
          <button
            onClick={() => {
              setOpen(false);
              // OnboardingWizard listens for this event (added in C2)
              window.dispatchEvent(new CustomEvent('mindbase:open-new-project'));
            }}
            className="flex items-center gap-2 w-full text-left px-3 py-2 text-[12px] cursor-pointer"
            style={{ color: 'var(--text-default)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Plus size={12} strokeWidth={1.8} /> New project…
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
