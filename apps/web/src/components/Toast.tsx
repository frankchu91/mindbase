import { useToast } from '../store/toast';

export function ToastHost() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      data-testid="toast-host"
      className="fixed left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2"
      style={{ bottom: '24px' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 max-w-md"
          style={{
            background: t.kind === 'error' ? '#7f1d1d' : 'var(--bg-input)',
            color: t.kind === 'error' ? '#fee2e2' : 'inherit',
            border: '1px solid var(--border)',
          }}
        >
          <span className="text-sm">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="icon-button text-base w-6 h-6 flex items-center justify-center leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
