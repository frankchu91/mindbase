import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

interface PairCodeData {
  code: string;
  qr: string;
  expiresAt: number;
}

export function PairCodeQR() {
  const [data, setData] = useState<PairCodeData | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [error, setError] = useState<string | null>(null);

  async function regen() {
    try {
      const json = await apiGet<PairCodeData>('/devices/pair-code');
      setData(json);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { void regen(); }, []);

  useEffect(() => {
    if (!data) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) void regen();
    }, 1000);
    return () => clearInterval(t);
  }, [data]);

  if (error) {
    return (
      <div
        className="flex flex-col items-center gap-3 p-6 rounded-lg text-sm"
        style={{ border: '1px solid var(--border)', background: 'var(--error-bg)', color: 'var(--error)' }}
      >
        Failed to load pair code: {error}
        <button
          onClick={() => void regen()}
          className="text-xs underline"
          style={{ color: 'var(--accent)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="flex items-center justify-center p-6 rounded-lg text-sm"
        style={{ border: '1px solid var(--border)', color: 'var(--text-mid)' }}
      >
        Generating pair code…
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-3 p-6 rounded-lg"
      style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
    >
      <img src={data.qr} alt="Pair code QR" className="w-56 h-56 rounded" />
      <div
        className="text-2xl font-mono tracking-wider px-4 py-2 rounded-lg"
        style={{ background: 'var(--surface-2)', color: 'var(--text-high)' }}
      >
        {data.code}
      </div>
      <div className="text-sm text-center" style={{ color: 'var(--text-mid)' }}>
        Expires in {secondsLeft}s · scan from MindBase mobile app or paste in browser extension
      </div>
    </div>
  );
}
