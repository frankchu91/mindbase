import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  cta?: { label: string; onClick: () => void };
  size?: 'normal' | 'compact';
}

export function EmptyState({ icon: Icon, title, subtitle, cta, size = 'normal' }: Props) {
  const iconSize = size === 'compact' ? 20 : 32;
  const pad = size === 'compact' ? 'py-4 px-3' : 'py-10 px-6';
  const titleSize = size === 'compact' ? 'text-[12px]' : 'text-[13px]';
  return (
    <div className={`flex flex-col items-center text-center ${pad}`} data-testid="empty-state">
      <Icon size={iconSize} strokeWidth={1.5} style={{ color: 'var(--text-faint)' }} />
      <div className={`mt-2 ${titleSize} font-medium`} style={{ color: 'var(--text-mid)' }}>
        {title}
      </div>
      {subtitle && (
        <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
          {subtitle}
        </div>
      )}
      {cta && (
        <button
          onClick={cta.onClick}
          className="mt-3 px-3 py-1 rounded text-[11.5px] cursor-pointer"
          style={{
            background: 'var(--accent-soft, var(--bg-2))',
            color: 'var(--accent)',
            border: '0.5px solid var(--hairline)',
          }}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
