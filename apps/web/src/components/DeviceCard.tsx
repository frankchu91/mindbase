export interface Device {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  lastSeen: string;
}

export function DeviceCard({ device, onRevoke }: { device: Device; onRevoke: (id: string) => void }) {
  const lastSeen = new Date(device.lastSeen);
  const ago = Math.round((Date.now() - lastSeen.getTime()) / 60000);

  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg"
      style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
    >
      <div className="flex flex-col gap-0.5">
        <div className="text-sm font-medium" style={{ color: 'var(--text-high)' }}>
          {device.name}
        </div>
        <div className="text-xs" style={{ color: 'var(--text-mid)' }}>
          {device.type} · last seen {ago < 1 ? 'just now' : `${ago}m ago`}
        </div>
      </div>
      <button
        onClick={() => onRevoke(device.id)}
        className="text-xs px-3 py-1.5 rounded-md transition-colors"
        style={{ color: 'var(--error)', border: '1px solid var(--error)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--error-bg)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        Revoke
      </button>
    </div>
  );
}
