// apps/web/src/components/onboarding/OnboardingWizard.tsx
import { useEffect, useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useProjects } from '../../store/projects';
import { useShellState } from '../../store/shell-state';
import type { ProjectTemplateId } from '@mindbase/core';

interface Template {
  id: ProjectTemplateId;
  name: string;
  description: string;
}

export function OnboardingWizard() {
  const create = useProjects((s) => s.create);
  const switchTo = useProjects((s) => s.switchTo);
  const setOnboardingComplete = useShellState((s) => s.setOnboardingComplete);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<ProjectTemplateId | undefined>(undefined);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // For v0, the template list is hardcoded here (matches core/templates).
    // Future: fetch from /api/projects/templates if we add that endpoint.
    setTemplates([
      { id: 'literature-review', name: 'Literature Review', description: 'Papers, evolving thesis on a research topic.' },
      { id: 'market-research', name: 'Market Research', description: 'Companies, products, competitor landscape.' },
      { id: 'investigation', name: 'Investigation', description: 'Case files, evidence, timeline events.' },
      { id: 'reading-companion', name: 'Reading Companion', description: 'Build a wiki for a book — characters, places, events.' },
      { id: 'topic-tracker', name: 'Topic Tracker', description: 'Open-ended — anything that grows over time.' },
    ]);
  }, []);

  async function finish(): Promise<void> {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const meta = await create(name.trim(), template);
      setOnboardingComplete();
      await switchTo(meta.id);
      // switchTo reloads the window — onboarding will dismiss automatically.
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div
        className="w-[520px] rounded-xl p-8"
        style={{ background: 'var(--win-bg)', border: '0.5px solid var(--hairline)', boxShadow: '0 30px 80px rgba(0,0,0,0.40)' }}
        data-testid="onboarding-wizard"
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
          <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-mid)' }}>
            Welcome to MindBase
          </span>
        </div>

        {step === 1 && (
          <>
            <h1 className="text-[22px] font-semibold mb-1" style={{ color: 'var(--text-high)' }}>
              What are you researching?
            </h1>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text-mid)' }}>
              MindBase organizes everything under a project. Give yours a name.
            </p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) setStep(2); }}
              placeholder="e.g. RAG techniques, LOTR re-read, Q4 competitor analysis"
              className="w-full px-3 py-2 rounded text-[14px] outline-none"
              style={{ background: 'var(--bg-2)', border: '0.5px solid var(--hairline)', color: 'var(--text-high)' }}
            />
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!name.trim()}
                className="px-4 py-2 rounded text-[13px] cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                Next <ChevronRight size={13} strokeWidth={1.8} className="inline" />
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-[22px] font-semibold mb-1" style={{ color: 'var(--text-high)' }}>
              Pick a template
            </h1>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text-mid)' }}>
              Templates set how the LLM organizes your wiki. Skip to start blank.
            </p>
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {templates.map((t) => (
                <label
                  key={t.id}
                  className="flex items-start gap-3 p-3 rounded cursor-pointer"
                  style={{
                    background: template === t.id ? 'var(--row-hover)' : 'transparent',
                    border: template === t.id ? '0.5px solid var(--accent)' : '0.5px solid var(--hairline)',
                  }}
                >
                  <input
                    type="radio"
                    name="template"
                    value={t.id}
                    checked={template === t.id}
                    onChange={() => setTemplate(t.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-[13px] font-medium" style={{ color: 'var(--text-high)' }}>{t.name}</div>
                    <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-mid)' }}>{t.description}</div>
                  </div>
                </label>
              ))}
            </div>
            {err && <div className="mt-3 text-[12px]" style={{ color: 'var(--error)' }}>{err}</div>}
            <div className="mt-5 flex justify-between items-center">
              <button onClick={() => setStep(1)} className="text-[12px] cursor-pointer" style={{ color: 'var(--text-mid)' }}>
                ← Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => { setTemplate(undefined); void finish(); }}
                  disabled={busy}
                  className="text-[13px] px-3 py-2 cursor-pointer"
                  style={{ color: 'var(--text-mid)' }}
                >
                  Skip template
                </button>
                <button
                  onClick={() => void finish()}
                  disabled={busy}
                  className="text-[13px] px-4 py-2 rounded cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  {busy ? 'Creating…' : 'Create project'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
