import { useState, useEffect } from 'react';
import { apiGet, apiPut } from '../lib/api';

interface SrsConfig {
  enabled: boolean;
  autoExtract: boolean;
  extractionModel?: string;
  cardsPerPage: number;
  extractionIntervalHours: number;
  newCardsPerDayLimit: number;
}

const DEFAULT_CONFIG: SrsConfig = {
  enabled: true,
  autoExtract: true,
  extractionModel: '',
  cardsPerPage: 3,
  extractionIntervalHours: 6,
  newCardsPerDayLimit: 20,
};

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%',
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--surface-1)',
    color: 'var(--text-default)',
    fontSize: '12px',
    outline: 'none',
    ...extra,
  };
}

function labelStyle(): React.CSSProperties {
  return { fontSize: '11px', color: 'var(--text-mid)', marginBottom: '4px', display: 'block' };
}

export function SrsSettings() {
  const [config, setConfig] = useState<SrsConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ srs?: SrsConfig }>('/config')
      .then((r) => {
        if (r.srs) setConfig({ ...DEFAULT_CONFIG, ...r.srs });
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const full = await apiGet<Record<string, unknown>>('/config');
      await apiPut('/config', { ...full, srs: config });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof SrsConfig>(key: K, val: SrsConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-high)' }}>Spaced Repetition</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
            LLM auto-extracts Q+A cards from wiki pages and schedules reviews.
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          <span className="text-[11px]" style={{ color: 'var(--text-mid)' }}>
            {config.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      {config.enabled && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="srs-auto-extract"
              checked={config.autoExtract}
              onChange={(e) => set('autoExtract', e.target.checked)}
            />
            <label htmlFor="srs-auto-extract" className="text-[12px] cursor-pointer" style={{ color: 'var(--text-default)' }}>
              Auto-extract cards from new wiki pages
            </label>
          </div>

          <div>
            <label style={labelStyle()}>Extraction model (leave blank to use main model)</label>
            <input
              type="text"
              value={config.extractionModel ?? ''}
              onChange={(e) => set('extractionModel', e.target.value || undefined)}
              placeholder="e.g. claude-haiku-3-5 or gpt-4o-mini"
              style={inputStyle()}
            />
            <div className="text-[10px] mt-1" style={{ color: 'var(--text-faint)' }}>
              Use a cheaper model for batch extraction to reduce costs.
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label style={labelStyle()}>Cards per page</label>
              <input
                type="number"
                min={1}
                max={10}
                value={config.cardsPerPage}
                onChange={(e) => set('cardsPerPage', Math.max(1, parseInt(e.target.value, 10) || 3))}
                style={inputStyle()}
              />
            </div>
            <div>
              <label style={labelStyle()}>Scan interval (hrs)</label>
              <input
                type="number"
                min={1}
                max={168}
                value={config.extractionIntervalHours}
                onChange={(e) => set('extractionIntervalHours', Math.max(1, parseInt(e.target.value, 10) || 6))}
                style={inputStyle()}
              />
            </div>
            <div>
              <label style={labelStyle()}>New cards/day limit</label>
              <input
                type="number"
                min={1}
                max={200}
                value={config.newCardsPerDayLimit}
                onChange={(e) => set('newCardsPerDayLimit', Math.max(1, parseInt(e.target.value, 10) || 20))}
                style={inputStyle()}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-50"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-[11px]" style={{ color: 'var(--success)' }}>Saved!</span>}
        {error && <span className="text-[11px]" style={{ color: 'var(--error)' }}>{error}</span>}
      </div>
    </div>
  );
}
