import { useEffect, useState } from 'react';
import { PairCodeQR } from './PairCodeQR';
import { DeviceCard, type Device } from './DeviceCard';
import { apiGet, apiDelete } from '../lib/api';

export function DevicesPage({ onBack }: { onBack: () => void }) {
  const [devices, setDevices] = useState<Device[]>([]);

  async function load() {
    try {
      const r = await apiGet<{ devices: Device[] }>('/devices');
      setDevices(r.devices);
    } catch { /* ignore — server may not have devices yet */ }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, []);

  async function revoke(id: string) {
    if (!confirm('Revoke this device? It will need to pair again.')) return;
    try {
      await apiDelete(`/devices/${id}`);
      void load();
    } catch (e) {
      alert(`Failed to revoke device: ${(e as Error).message}`);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-sidebar)' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={onBack} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>←</button>
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Connected Devices</div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {/* QR pairing section */}
        <div className="flex flex-col gap-2">
          <div
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Pair a new device
          </div>
          <PairCodeQR />
        </div>

        {/* Paired devices list */}
        <div className="flex flex-col gap-2">
          <div
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Paired devices
          </div>
          {devices.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: 'var(--text-mid)' }}>
              No devices yet. Scan the QR above.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {devices.map((d) => (
                <DeviceCard key={d.id} device={d} onRevoke={(id) => void revoke(id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
