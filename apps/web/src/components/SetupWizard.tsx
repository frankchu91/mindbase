import { useState, useEffect } from 'react';
import type { ProviderName } from '@mindbase/core';
import { useSettings } from '../store/settings';
import { apiPut, apiPost } from '../lib/api';

type WizardStep = 'provider' | 'configure' | 'result';

interface ProviderOption {
  id: string;
  label: string;
  description: string;
  configProvider: ProviderName;  // what gets saved to config.provider
  needsApiKey: boolean;
  needsBaseUrl: boolean;
  defaults: { model: string; baseUrl: string };
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'openai', label: 'OpenAI', description: 'GPT-4o, GPT-4o-mini',
    configProvider: 'openai', needsApiKey: true, needsBaseUrl: false,
    defaults: { model: 'gpt-4o-mini', baseUrl: '' },
  },
  {
    id: 'anthropic', label: 'Anthropic', description: 'Claude Sonnet, Claude Opus',
    configProvider: 'anthropic', needsApiKey: true, needsBaseUrl: false,
    defaults: { model: 'claude-sonnet-4-20250514', baseUrl: '' },
  },
  {
    id: 'deepseek', label: 'DeepSeek', description: 'DeepSeek V3, DeepSeek R1',
    configProvider: 'deepseek', needsApiKey: true, needsBaseUrl: false,
    defaults: { model: 'deepseek-chat', baseUrl: '' },
  },
  {
    id: 'ollama', label: 'Ollama', description: 'Run models locally, no API key',
    configProvider: 'ollama', needsApiKey: false, needsBaseUrl: true,
    defaults: { model: 'llama3', baseUrl: 'http://localhost:11434' },
  },
  {
    id: 'custom', label: 'Custom Endpoint', description: 'Any OpenAI-compatible API',
    configProvider: 'openai', needsApiKey: false, needsBaseUrl: true,
    defaults: { model: '', baseUrl: '' },
  },
];

interface Props {
  mode: 'onboarding' | 'settings';
  /** Onboarding only: dismiss without configuring an LLM (set up later in Settings). */
  onSkip?: () => void;
  onBack?: () => void;       // settings mode: ← Back
  onComplete?: () => void;   // called after successful save
}

export function SetupWizard({ mode, onBack, onComplete, onSkip }: Props) {
  const settings = useSettings();

  // Determine initial provider from current config
  function detectProvider(): string {
    if (!settings.loaded) return 'openai';
    if (settings.provider === 'ollama') return 'ollama';
    if (settings.provider === 'anthropic') return 'anthropic';
    if (settings.provider === 'deepseek') return 'deepseek';
    if (settings.provider === 'openai' && settings.baseUrl) return 'custom';
    return 'openai';
  }

  const [step, setStep] = useState<WizardStep>(mode === 'settings' ? 'provider' : 'provider');
  const [selectedId, setSelectedId] = useState(detectProvider);
  const [apiKey, setApiKey] = useState(settings.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl ?? '');
  const [model, setModel] = useState(settings.model ?? '');
  const [autoSave, setAutoSave] = useState(settings.autoSave ?? true);
  const [mergeSaves, setMergeSaves] = useState(settings.mergeSaves ?? false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings.loaded) settings.loadFromServer();
  }, [settings.loaded, settings.loadFromServer]);

  // Re-sync local state when settings load
  useEffect(() => {
    if (!settings.loaded) return;
    setSelectedId(detectProvider());
    setApiKey(settings.apiKey);
    setBaseUrl(settings.baseUrl);
    setModel(settings.model);
    setAutoSave(settings.autoSave);
    setMergeSaves(settings.mergeSaves);
  }, [settings.loaded]);

  const selected = PROVIDERS.find((p) => p.id === selectedId)!;

  const stepIndex = step === 'provider' ? 0 : step === 'configure' ? 1 : 2;

  function selectProvider(id: string) {
    const provider = PROVIDERS.find((p) => p.id === id)!;
    setSelectedId(id);
    setModel(provider.defaults.model || model);
    setBaseUrl(provider.defaults.baseUrl || (id === 'custom' ? baseUrl : ''));
    if (!provider.needsApiKey) setApiKey('');
    setTestResult(null);
    setStep('configure');
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await apiPost<{ ok: boolean; error?: string }>('/config/test', {
        provider: selected.configProvider,
        model,
        apiKey,
        baseUrl,
      });
      setTestResult(r);
      if (r.ok) {
        if (mode === 'settings') {
          // Save immediately and close — result step not needed in settings mode
          await saveAndFinish();
        } else {
          setStep('result');
        }
      }
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function saveAndFinish() {
    setSaving(true);
    try {
      const config = {
        provider: selected.configProvider,
        model,
        apiKey,
        baseUrl,
        autoSave,
        mergeSaves,
      };
      await apiPut('/config', config);
      settings.setAll(config as unknown as Parameters<typeof settings.setAll>[0]);
      onComplete?.();
    } finally {
      setSaving(false);
    }
  }

  async function skipAndSave() {
    setSaving(true);
    try {
      const config = {
        provider: selected.configProvider,
        model,
        apiKey,
        baseUrl,
        autoSave: true,
        mergeSaves: false,
      };
      await apiPut('/config', config);
      settings.setAll(config as unknown as Parameters<typeof settings.setAll>[0]);
      onComplete?.();
    } finally {
      setSaving(false);
    }
  }

  // --- Render ---

  const header = mode === 'settings' ? (
    <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <button onClick={step === 'provider' ? onBack : () => setStep('provider')} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>←</button>
      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Settings</div>
    </div>
  ) : null;

  // Step 1: Provider selection
  if (step === 'provider') {
    return (
      <div className="flex flex-col h-full" style={{ background: mode === 'settings' ? 'var(--surface-0)' : 'transparent' }}>
        {header}
        <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col items-center justify-center">
          {mode === 'onboarding' && (
            <div className="flex gap-1.5 mb-8">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-[30px] h-[3px] rounded"
                  style={{
                    background: i === stepIndex ? 'var(--accent-azure)' : i < stepIndex ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                    boxShadow: i === stepIndex ? '0 0 8px rgba(128,180,255,0.6)' : 'none',
                  }} />
              ))}
            </div>
          )}
          <div className="w-full max-w-[420px] text-center">
            <div className="text-[10.5px] tracking-[3px] uppercase font-medium mb-3.5" style={{ color: 'var(--text-low)' }}>
              {mode === 'onboarding' ? 'Welcome · 1 of 3' : 'Provider'}
            </div>
            <div className="text-[32px] font-bold leading-[1.05] tracking-[-1.2px] mb-3.5" style={{ color: 'var(--text-high)' }}>
              {mode === 'onboarding' ? <>Choose how you<br /><span className="accent-italic">think.</span></> : 'Choose your provider'}
            </div>
            <div className="text-[13px] leading-[1.55] mb-8" style={{ color: 'var(--text-mid)' }}>
              {mode === 'onboarding' ? <>MindBase needs an LLM to compile your knowledge.<br />Pick the one you already pay for.</> : 'You can change this any time.'}
            </div>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {PROVIDERS.map((p) => {
                const isSelected = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => selectProvider(p.id)}
                    className="text-left p-4 rounded-[12px] glass-card transition-all hover:-translate-y-0.5 relative"
                    style={{
                      borderColor: isSelected ? 'var(--border-focus)' : 'var(--border-default)',
                      boxShadow: isSelected ? '0 0 0 1px rgba(128,180,255,0.3), 0 0 24px rgba(128,180,255,0.15)' : 'none',
                    }}
                  >
                    {isSelected && (
                      <div className="absolute top-3.5 right-3.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{ background: 'var(--accent-azure)', color: 'var(--text-inverse)' }}>✓</div>
                    )}
                    <div className="text-[18px] mb-2 opacity-90">{p.id === 'openai' ? '⌬' : p.id === 'anthropic' ? '◆' : p.id === 'deepseek' ? '⬡' : p.id === 'ollama' ? '⌂' : '◇'}</div>
                    <div className="text-[13px] font-semibold tracking-tight" style={{ color: 'var(--text-high)' }}>{p.label}</div>
                    <div className="text-[10.5px] mt-1 leading-[1.4]" style={{ color: 'var(--text-low)' }}>{p.description}</div>
                  </button>
                );
              })}
            </div>
            {mode === 'onboarding' && onSkip && (
              <button
                onClick={onSkip}
                data-testid="onboarding-skip"
                className="text-[12px] cursor-pointer bg-transparent border-none"
                style={{ color: 'var(--text-low)', textDecoration: 'underline', textUnderlineOffset: 3 }}
              >
                Skip for now — browse and capture work without an LLM; set this up later in Settings
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Configure
  if (step === 'configure') {
    return (
      <div className="flex flex-col h-full" style={{ background: mode === 'settings' ? 'var(--surface-0)' : 'transparent' }}>
        {header ?? (
          <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <button onClick={() => setStep('provider')} className="text-sm font-medium" style={{ color: 'var(--accent-azure)' }}>←</button>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-high)' }}>{selected.label}</div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col items-center justify-center">
          {mode === 'onboarding' && (
            <div className="flex gap-1.5 mb-8">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-[30px] h-[3px] rounded"
                  style={{
                    background: i === stepIndex ? 'var(--accent-azure)' : i < stepIndex ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                    boxShadow: i === stepIndex ? '0 0 8px rgba(128,180,255,0.6)' : 'none',
                  }} />
              ))}
            </div>
          )}
          <div className="w-full max-w-[440px]">
            <div className="text-center mb-7">
              <div className="text-[10.5px] tracking-[3px] uppercase font-medium mb-3.5" style={{ color: 'var(--text-low)' }}>
                {mode === 'onboarding' ? 'Connect · 2 of 3' : 'Configure'}
              </div>
              <div className="text-[32px] font-bold leading-[1.05] tracking-[-1.2px] mb-3.5" style={{ color: 'var(--text-high)' }}>
                {mode === 'onboarding' ? <>Almost <span className="accent-italic">there.</span></> : selected.label}
              </div>
              <div className="text-[13px] leading-[1.55]" style={{ color: 'var(--text-mid)' }}>
                {selected.needsApiKey ? 'Stored locally — never leaves your computer.' : 'Connecting to your local model.'}
              </div>
            </div>

            <div className="flex flex-col gap-3.5 mb-6">
              {selected.needsBaseUrl && (
                <div>
                  <div className="text-[10.5px] tracking-[1px] uppercase font-semibold mb-1.5" style={{ color: 'var(--text-mid)' }}>Base URL</div>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full rounded-[10px] px-3.5 py-3 text-[13px] font-mono outline-none glass-card transition-colors"
                    style={{ color: 'var(--text-default)' }}
                  />
                  {selected.id === 'custom' && (
                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-faint)' }}>
                      Works with LiteLLM, vLLM, OpenRouter, or any OpenAI-compatible API
                    </div>
                  )}
                </div>
              )}
              {(selected.needsApiKey || selected.id === 'custom') && (
                <div>
                  <div className="text-[10.5px] tracking-[1px] uppercase font-semibold mb-1.5" style={{ color: 'var(--text-mid)' }}>API Key {selected.id === 'custom' ? '(optional)' : ''}</div>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={selected.configProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                    className="w-full rounded-[10px] px-3.5 py-3 text-[13px] font-mono outline-none glass-card transition-colors"
                    style={{ color: 'var(--text-default)' }}
                  />
                </div>
              )}
              <div>
                <div className="text-[10.5px] tracking-[1px] uppercase font-semibold mb-1.5" style={{ color: 'var(--text-mid)' }}>Model</div>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={selected.defaults.model || 'model-name'}
                  className="w-full rounded-[10px] px-3.5 py-3 text-[13px] font-mono outline-none glass-card transition-colors"
                  style={{ color: 'var(--text-default)' }}
                />
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={testConnection}
                disabled={testing || saving || !model}
                className="px-5 py-3 rounded-full text-[13px] font-semibold disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--text-inverse)' }}
              >
                {testing ? 'Testing…' : saving ? 'Saving…' : mode === 'settings' ? 'Test & Save →' : 'Test & Continue →'}
              </button>
            </div>

            {testResult && !testResult.ok && (
              <div className="mt-4 text-[11px] px-3 py-2 rounded-md text-center" style={{ background: 'var(--error-bg)', color: 'var(--error)' }}>
                {testResult.error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Result (onboarding only — settings mode saves and exits from configure step)
  return (
    <div className="flex flex-col h-full" style={{ background: 'transparent' }}>
      {header}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
        <div className="flex gap-1.5 mb-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[30px] h-[3px] rounded"
              style={{
                background: i === stepIndex ? 'var(--accent-azure)' : i < stepIndex ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                boxShadow: i === stepIndex ? '0 0 8px rgba(128,180,255,0.6)' : 'none',
              }} />
          ))}
        </div>
        {testResult?.ok ? (
          <>
            <div className="success-mark mb-8">✓</div>
            <div className="text-[10.5px] tracking-[3px] uppercase font-medium mb-3" style={{ color: 'var(--text-low)' }}>
              Connected
            </div>
            <div className="text-[32px] font-bold leading-[1.05] tracking-[-1.2px] mb-3.5" style={{ color: 'var(--text-high)' }}>
              Your second brain<br /><span className="accent-italic">is online.</span>
            </div>
            <div className="text-[13px] mb-8" style={{ color: 'var(--text-mid)' }}>
              {selected.label} · {model} · ready to compile.
            </div>
            <button
              onClick={saveAndFinish}
              disabled={saving}
              className="px-6 py-3 rounded-full text-[13px] font-semibold disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--text-inverse)' }}
            >
              {saving ? 'Saving…' : 'Open MindBase →'}
            </button>
            <div className="mt-9 text-[10.5px] max-w-[380px] leading-[1.6]" style={{ color: 'var(--text-low)' }}>
              Tip: type <code className="px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-mid)' }}>/ingest</code> in chat to add a source.
            </div>
          </>
        ) : (
          <>
            <div className="text-5xl mb-6">✕</div>
            <div className="text-[18px] font-semibold mb-2" style={{ color: 'var(--text-high)' }}>Connection failed</div>
            <div className="text-[13px] text-center px-4 mb-6" style={{ color: 'var(--error)' }}>
              {testResult?.error ?? 'Unknown error'}
            </div>
            <button
              onClick={() => setStep('configure')}
              className="px-6 py-3 rounded-full text-[13px]"
              style={{ border: '1px solid var(--border-strong)', color: 'var(--text-default)' }}
            >Try again</button>
            <button onClick={skipAndSave} disabled={saving}
              className="mt-4 text-[11px] underline disabled:opacity-40"
              style={{ color: 'var(--text-low)' }}>Skip for now</button>
          </>
        )}
      </div>
    </div>
  );
}
