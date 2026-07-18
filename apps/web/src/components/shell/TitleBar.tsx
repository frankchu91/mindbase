import { ProjectSwitcher } from './ProjectSwitcher';

export function TitleBar() {
  return (
    <div
      className="h-9 flex items-center px-3 relative"
      style={{
        background: 'var(--titlebar-bg)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '0.5px solid var(--hairline)',
      }}
    >
      <div className="flex items-center gap-[7px]">
        <span
          className="w-3 h-3 rounded-full"
          style={{ background: '#ff5f57', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.18) inset' }}
        />
        <span
          className="w-3 h-3 rounded-full"
          style={{ background: '#febc2e', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.18) inset' }}
        />
        <span
          className="w-3 h-3 rounded-full"
          style={{ background: '#28c840', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.18) inset' }}
        />
        <div className="ml-2">
          <ProjectSwitcher />
        </div>
      </div>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] font-semibold"
        style={{ color: 'var(--text-title)' }}
      >
        MindBase
      </div>
    </div>
  );
}
