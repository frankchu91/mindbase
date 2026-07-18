// apps/web/src/components/shell/ProjectSwitcher.tsx
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useProjects } from '../../store/projects';

export function ProjectSwitcher() {
  const projects = useProjects((s) => s.projects);
  const currentProjectId = useProjects((s) => s.currentProjectId);
  const load = useProjects((s) => s.load);
  const switchTo = useProjects((s) => s.switchTo);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = projects.find((p) => p.id === currentProjectId);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[12px]"
        style={{ color: 'var(--text-high)', background: 'transparent' }}
        data-testid="project-switcher-button"
      >
        <span style={{ color: 'var(--text-faint)' }}>Project ·</span>
        <span style={{ fontWeight: 500 }}>{current?.name ?? currentProjectId}</span>
        <ChevronDown size={11} strokeWidth={1.8} style={{ color: 'var(--text-mid)' }} />
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 left-0 rounded-md shadow-lg z-50 min-w-[240px]"
          style={{
            background: 'var(--win-bg)',
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
        </div>
      )}
    </div>
  );
}
