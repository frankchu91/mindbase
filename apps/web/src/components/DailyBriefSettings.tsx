import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut } from '../lib/api';

const CURATED_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
];

function getSupportedTimezones(): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tzs: string[] = (Intl as any).supportedValuesOf('timeZone');
    return tzs;
  } catch {
    return CURATED_TIMEZONES;
  }
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

interface DailyBriefConfig {
  enabled: boolean;
  time: string;
  timezone: string;
  email: string;
  publicUrl: string;
  smtp: SmtpConfig;
  includeOnThisDay: boolean;
  includeQuiz: boolean;
  manualOnly: boolean;
}

const DEFAULT_CONFIG: DailyBriefConfig = {
  enabled: false,
  time: '09:00',
  timezone: 'UTC',
  email: '',
  publicUrl: 'http://localhost:4321',
  smtp: {
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    from: '',
  },
  includeOnThisDay: true,
  includeQuiz: false,
  manualOnly: true,
};

interface Props {
  currentConfig?: Partial<DailyBriefConfig>;
  onSave: (cfg: DailyBriefConfig) => Promise<void>;
}

export function DailyBriefSettings({ currentConfig, onSave }: Props) {
  const [cfg, setCfg] = useState<DailyBriefConfig>({
    ...DEFAULT_CONFIG,
    ...currentConfig,
    smtp: { ...DEFAULT_CONFIG.smtp, ...(currentConfig?.smtp ?? {}) },
  });
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const timezones = getSupportedTimezones();

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function updateSmtp(field: keyof SmtpConfig, value: string | number | boolean) {
    setCfg((prev) => ({ ...prev, smtp: { ...prev.smtp, [field]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(cfg);
      showToast('Saved', true);
    } catch (e) {
      showToast(`Save failed: ${(e as Error).message}`, false);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow() {
    setSendingTest(true);
    try {
      await apiPost('/brief/send-now', {});
      showToast('Brief sent!', true);
    } catch (e) {
      showToast(`Send failed: ${(e as Error).message}`, false);
    } finally {
      setSendingTest(false);
    }
  }

  async function handlePreview() {
    setLoadingPreview(true);
    try {
      const r = await apiGet<{ html: string }>('/brief/preview');
      setPreviewHtml(r.html);
    } catch (e) {
      showToast(`Preview failed: ${(e as Error).message}`, false);
    } finally {
      setLoadingPreview(false);
    }
  }

  const inputStyle = {
    color: 'var(--text-default)',
  } as const;

  const labelStyle = {
    color: 'var(--text-mid)',
  } as const;

  return (
    <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="text-[10.5px] tracking-[1px] uppercase font-semibold mb-1.5" style={labelStyle}>
        Daily Brief
      </div>
      <div className="text-[11px] mb-3" style={{ color: 'var(--text-low)' }}>
        Get a 200-word email digest of your recent captures every morning with clickable citations.
      </div>

      {/* Enable toggle */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => setCfg((p) => ({ ...p, enabled: !p.enabled }))}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: cfg.enabled ? 'var(--accent-azure)' : 'var(--surface-2)', flexShrink: 0 }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
            style={{ transform: cfg.enabled ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
        <span className="text-[12px]" style={labelStyle}>
          {cfg.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {cfg.enabled && (
        <div className="flex flex-col gap-3">
          {/* Time + Timezone */}
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
                Send at
              </div>
              <input
                type="time"
                value={cfg.time}
                onChange={(e) => setCfg((p) => ({ ...p, time: e.target.value }))}
                className="w-full rounded-[8px] px-2.5 py-2 text-[12px] outline-none glass-card"
                style={inputStyle}
              />
            </div>
            <div className="flex-2" style={{ flex: 2 }}>
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
                Timezone
              </div>
              <select
                value={cfg.timezone}
                onChange={(e) => setCfg((p) => ({ ...p, timezone: e.target.value }))}
                className="w-full rounded-[8px] px-2.5 py-2 text-[12px] outline-none glass-card"
                style={{ ...inputStyle, background: 'var(--surface-1)' }}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Recipient email */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
              Recipient email
            </div>
            <input
              type="email"
              value={cfg.email}
              onChange={(e) => setCfg((p) => ({ ...p, email: e.target.value }))}
              placeholder="you@example.com"
              className="w-full rounded-[8px] px-2.5 py-2 text-[12px] outline-none glass-card"
              style={inputStyle}
            />
          </div>

          {/* Public URL */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
              Public URL (for clickable links)
            </div>
            <input
              type="url"
              value={cfg.publicUrl}
              onChange={(e) => setCfg((p) => ({ ...p, publicUrl: e.target.value }))}
              placeholder="http://localhost:4321"
              className="w-full rounded-[8px] px-2.5 py-2 text-[12px] font-mono outline-none glass-card"
              style={inputStyle}
            />
          </div>

          {/* SMTP */}
          <div
            className="rounded-[8px] p-3 flex flex-col gap-2.5"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="text-[10.5px] font-semibold uppercase tracking-wide" style={labelStyle}>
              SMTP settings
            </div>

            <div className="flex gap-2">
              <div style={{ flex: 3 }}>
                <div className="text-[10px] uppercase tracking-wide mb-1" style={labelStyle}>Host</div>
                <input
                  type="text"
                  value={cfg.smtp.host}
                  onChange={(e) => updateSmtp('host', e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full rounded-[6px] px-2 py-1.5 text-[11.5px] font-mono outline-none"
                  style={{ ...inputStyle, background: 'var(--surface-0)', border: '1px solid var(--border-subtle)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="text-[10px] uppercase tracking-wide mb-1" style={labelStyle}>Port</div>
                <input
                  type="number"
                  value={cfg.smtp.port}
                  onChange={(e) => updateSmtp('port', parseInt(e.target.value, 10) || 587)}
                  className="w-full rounded-[6px] px-2 py-1.5 text-[11.5px] font-mono outline-none"
                  style={{ ...inputStyle, background: 'var(--surface-0)', border: '1px solid var(--border-subtle)' }}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.smtp.secure}
                onChange={(e) => updateSmtp('secure', e.target.checked)}
                className="w-3.5 h-3.5"
              />
              <span className="text-[11px]" style={labelStyle}>Secure (SSL/TLS on port 465)</span>
            </label>

            <div>
              <div className="text-[10px] uppercase tracking-wide mb-1" style={labelStyle}>Username</div>
              <input
                type="text"
                value={cfg.smtp.user}
                onChange={(e) => updateSmtp('user', e.target.value)}
                placeholder="you@gmail.com"
                className="w-full rounded-[6px] px-2 py-1.5 text-[11.5px] font-mono outline-none"
                style={{ ...inputStyle, background: 'var(--surface-0)', border: '1px solid var(--border-subtle)' }}
              />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wide mb-1" style={labelStyle}>
                Password (app-specific recommended)
              </div>
              <input
                type="password"
                value={cfg.smtp.pass}
                onChange={(e) => updateSmtp('pass', e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full rounded-[6px] px-2 py-1.5 text-[11.5px] font-mono outline-none"
                style={{ ...inputStyle, background: 'var(--surface-0)', border: '1px solid var(--border-subtle)' }}
              />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wide mb-1" style={labelStyle}>
                From address (optional)
              </div>
              <input
                type="email"
                value={cfg.smtp.from}
                onChange={(e) => updateSmtp('from', e.target.value)}
                placeholder="MindBase <you@example.com>"
                className="w-full rounded-[6px] px-2 py-1.5 text-[11.5px] font-mono outline-none"
                style={{ ...inputStyle, background: 'var(--surface-0)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.includeOnThisDay}
                onChange={(e) => setCfg((p) => ({ ...p, includeOnThisDay: e.target.checked }))}
                className="w-3.5 h-3.5"
              />
              <span className="text-[11px]" style={labelStyle}>Include "On This Day" (1w/1m/1y ago)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.includeQuiz}
                onChange={(e) => setCfg((p) => ({ ...p, includeQuiz: e.target.checked }))}
                className="w-3.5 h-3.5"
              />
              <span className="text-[11px]" style={labelStyle}>Include recall quiz</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.manualOnly}
                onChange={(e) => setCfg((p) => ({ ...p, manualOnly: e.target.checked }))}
                className="w-3.5 h-3.5"
              />
              <span className="text-[11px]" style={labelStyle}>Manual only (disable auto-send at scheduled time)</span>
            </label>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[11px] px-3 py-1.5 rounded-md font-medium disabled:opacity-50 transition-colors"
          style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--text-inverse)' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        {cfg.enabled && (
          <>
            <button
              onClick={handleSendNow}
              disabled={sendingTest}
              className="text-[11px] px-3 py-1.5 rounded-md font-medium disabled:opacity-50 transition-colors"
              style={{ border: '1px solid var(--border-default)', color: 'var(--text-default)' }}
            >
              {sendingTest ? 'Sending…' : 'Send test brief now'}
            </button>

            <button
              onClick={handlePreview}
              disabled={loadingPreview}
              className="text-[11px] px-3 py-1.5 rounded-md font-medium disabled:opacity-50 transition-colors"
              style={{ border: '1px solid var(--border-default)', color: 'var(--text-default)' }}
            >
              {loadingPreview ? 'Loading…' : 'Preview'}
            </button>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="mt-2 text-[11px] px-2.5 py-1.5 rounded-md"
          style={{
            background: toast.ok ? 'rgba(60,180,90,0.12)' : 'rgba(220,50,50,0.12)',
            color: toast.ok ? 'var(--success)' : 'var(--error)',
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Preview modal */}
      {previewHtml && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setPreviewHtml(null)}
        >
          <div
            className="relative rounded-xl overflow-hidden"
            style={{ width: '680px', maxHeight: '85vh', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-high)' }}>
                Brief Preview
              </span>
              <button
                onClick={() => setPreviewHtml(null)}
                className="text-[13px]"
                style={{ color: 'var(--text-mid)' }}
              >
                ✕
              </button>
            </div>
            <iframe
              srcDoc={previewHtml}
              className="w-full"
              style={{ height: 'calc(85vh - 44px)', background: '#fff', border: 'none' }}
              title="Brief Preview"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      )}
    </div>
  );
}
