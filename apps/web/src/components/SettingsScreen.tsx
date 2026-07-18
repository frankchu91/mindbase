import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  MailOpen,
  Rss,
  Layers,
  Plug,
  Compass,
  Share2,
  FileText,
  BookOpen,
  Trash2,
  HardDrive,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-react';
import { useCanvasRoute } from '../store/canvas-route';
import { SetupWizard } from './SetupWizard';
import { DailyBriefSettings } from './DailyBriefSettings';
import { RssFeedsSettings } from './RssFeedsSettings';
import { SrsSettings } from './SrsSettings';
import { AiClientsSetup } from './AiClientsSetup';
import { SchemaSettings } from './SchemaSettings';
import { SchemaSettingsView } from './settings/SchemaSettingsView';
import { DataLocationView } from './settings/DataLocationView';
import { apiGet, apiPut } from '../lib/api';
import { showToast } from '../store/toast';

const SETTINGS_RAIL_KEY = 'mindbase.settingsRailWidth';
const SETTINGS_RAIL_DEFAULT = 220;
const SETTINGS_RAIL_MIN = 180;
const SETTINGS_RAIL_MAX = 400;

type Section =
  | 'profile'
  | 'provider'
  | 'daily-brief'
  | 'rss'
  | 'srs'
  | 'ai-clients'
  | 'obsidian'
  | 'graph-export'
  | 'schema'
  | 'project-schema'
  | 'storage'
  | 'data-location';

interface NavItem {
  id: Section;
  label: string;
  Icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'profile',      label: 'Profile',                  Icon: UserIcon },
  { id: 'provider',     label: 'Provider / LLM',          Icon: SettingsIcon },
  { id: 'daily-brief',  label: 'Daily Brief',              Icon: MailOpen },
  { id: 'rss',          label: 'RSS Feeds',                Icon: Rss },
  { id: 'srs',          label: 'Spaced Repetition',        Icon: Layers },
  { id: 'ai-clients',   label: 'AI Clients (MCP)',         Icon: Plug },
  { id: 'obsidian',     label: 'Obsidian Integration',     Icon: Compass },
  { id: 'graph-export', label: 'Graph Export',             Icon: Share2 },
  { id: 'schema',          label: 'Wiki Schema',              Icon: BookOpen },
  { id: 'project-schema',  label: 'Project Schema',           Icon: FileText },
  { id: 'data-location',   label: 'Data location',            Icon: HardDrive },
  { id: 'storage',      label: 'Storage & Trash',          Icon: Trash2 },
];

interface Props {
  onClose: () => void;
}

export function SettingsScreen({ onClose }: Props) {
  const [section, setSection] = useState<Section>('provider');
  const [briefConfig, setBriefConfig] = useState<Record<string, unknown> | undefined>(undefined);
  const [railWidth, setRailWidth] = useState<number>(() => {
    const stored = localStorage.getItem(SETTINGS_RAIL_KEY);
    return stored ? Math.max(SETTINGS_RAIL_MIN, Math.min(SETTINGS_RAIL_MAX, parseInt(stored, 10))) : SETTINGS_RAIL_DEFAULT;
  });
  const railWidthRef = useRef(railWidth);
  railWidthRef.current = railWidth;

  const onRailMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = railWidthRef.current;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    function onMove(ev: MouseEvent) {
      const next = Math.max(SETTINGS_RAIL_MIN, Math.min(SETTINGS_RAIL_MAX, startWidth + (ev.clientX - startX)));
      setRailWidth(next);
      localStorage.setItem(SETTINGS_RAIL_KEY, String(next));
    }
    function onUp() {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    apiGet<{ dailyBrief?: Record<string, unknown> }>('/config')
      .then((c) => setBriefConfig(c.dailyBrief))
      .catch(() => {});
  }, []);

  async function saveBrief(cfg: Record<string, unknown>) {
    const current = await apiGet<Record<string, unknown>>('/config');
    await apiPut('/config', { ...current, dailyBrief: cfg });
    setBriefConfig(cfg);
  }

  async function colorizeObsidian(mode: string) {
    await fetch('/api/obsidian/colorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    alert('Done — reload your Obsidian vault to see colors');
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      {/* Left rail */}
      <div
        className="flex flex-col shrink-0"
        style={{
          width: `${railWidth}px`,
          background: 'var(--bg-sidebar)',
        }}
      >
        {/* Top bar */}
        <div
          className="px-3 py-3 flex items-center gap-2"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="text-[13px] font-medium flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors"
            style={{ color: 'var(--accent)' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
          >
            ← Done
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className="w-full text-left px-3 py-2 rounded-md text-[12px] flex items-center gap-2 transition-colors"
                style={{
                  background: active ? 'var(--bg-hover)' : 'transparent',
                  color: active ? 'var(--text-high)' : 'var(--text-mid)',
                  fontWeight: active ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <item.Icon size={15} strokeWidth={1.6} className="shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onRailMouseDown}
        onDoubleClick={() => {
          setRailWidth(SETTINGS_RAIL_DEFAULT);
          localStorage.setItem(SETTINGS_RAIL_KEY, String(SETTINGS_RAIL_DEFAULT));
        }}
        style={{
          width: '4px',
          flexShrink: 0,
          cursor: 'col-resize',
          zIndex: 10,
          background: 'transparent',
          borderRight: '1px solid var(--border)',
          transition: 'background 150ms',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(128,180,255,0.4)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        title="Drag to resize · Double-click to reset"
      />

      {/* Main content */}
      <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-main)' }}>
        {section === 'profile' && (
          <div className="px-8 py-6 max-w-2xl">
            <h2 className="text-[16px] font-semibold mb-4" style={{ color: 'var(--text-high)' }}>
              Profile
            </h2>
            <UsernameField />
          </div>
        )}

        {section === 'provider' && (
          <SetupWizard mode="settings" onBack={onClose} onComplete={onClose} />
        )}

        {section === 'daily-brief' && (
          <div className="px-8 py-6 max-w-2xl">
            <h2 className="text-[16px] font-semibold mb-4" style={{ color: 'var(--text-high)' }}>
              Daily Brief
            </h2>
            <DailyBriefSettings
              currentConfig={briefConfig as Parameters<typeof DailyBriefSettings>[0]['currentConfig']}
              onSave={async (cfg) => {
                await saveBrief(cfg as unknown as Record<string, unknown>);
              }}
            />
          </div>
        )}

        {section === 'rss' && (
          <div className="px-8 py-6 max-w-2xl">
            <h2 className="text-[16px] font-semibold mb-4" style={{ color: 'var(--text-high)' }}>
              RSS Feeds
            </h2>
            <RssFeedsSettings />
          </div>
        )}

        {section === 'srs' && (
          <div className="px-8 py-6 max-w-2xl">
            <h2 className="text-[16px] font-semibold mb-4" style={{ color: 'var(--text-high)' }}>
              Spaced Repetition
            </h2>
            <SrsSettings />
          </div>
        )}

        {section === 'ai-clients' && (
          <div className="px-8 py-6 max-w-2xl">
            <h2 className="text-[16px] font-semibold mb-4" style={{ color: 'var(--text-high)' }}>
              AI Clients (MCP)
            </h2>
            <AiClientsSetup />
          </div>
        )}

        {section === 'obsidian' && (
          <div className="px-8 py-6 max-w-2xl">
            <h2 className="text-[16px] font-semibold mb-4" style={{ color: 'var(--text-high)' }}>
              Obsidian Integration
            </h2>
            <p className="text-[12px] mb-4" style={{ color: 'var(--text-low)' }}>
              Color Obsidian's graph view by tag, category, or visibility. Open{' '}
              <code
                className="px-1.5 py-0.5 rounded text-[11px]"
                style={{ background: 'var(--surface-2)', color: 'var(--text-mid)' }}
              >
                ~/mindbase-data/
              </code>{' '}
              as an Obsidian vault.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => colorizeObsidian('by-tag')}
                className="px-4 py-2 rounded-md text-[12px] transition-colors"
                style={{ border: '1px solid var(--border-default)', color: 'var(--text-default)' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
              >
                Colorize by Tag
              </button>
              <button
                onClick={() => colorizeObsidian('by-category')}
                className="px-4 py-2 rounded-md text-[12px] transition-colors"
                style={{ border: '1px solid var(--border-default)', color: 'var(--text-default)' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
              >
                Colorize by Category
              </button>
              <button
                onClick={() => colorizeObsidian('by-visibility')}
                className="px-4 py-2 rounded-md text-[12px] transition-colors"
                style={{ border: '1px solid var(--border-default)', color: 'var(--text-default)' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
              >
                Colorize by Visibility
              </button>
            </div>
          </div>
        )}

        {section === 'graph-export' && (
          <div className="px-8 py-6 max-w-2xl">
            <h2 className="text-[16px] font-semibold mb-4" style={{ color: 'var(--text-high)' }}>
              Graph Export
            </h2>
            <p className="text-[12px] mb-4" style={{ color: 'var(--text-low)' }}>
              Export your knowledge graph in standard formats. Pages tagged{' '}
              <code
                className="px-1.5 py-0.5 rounded text-[11px]"
                style={{ background: 'var(--surface-2)', color: 'var(--text-mid)' }}
              >
                visibility/pii
              </code>{' '}
              are excluded.
            </p>
            <div className="flex gap-3">
              <a
                href="/api/graph"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-md text-[12px] inline-block transition-colors"
                style={{ border: '1px solid var(--border-default)', color: 'var(--text-default)' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = 'transparent')}
              >
                JSON
              </a>
              <a
                href="/api/graph/graphml"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-md text-[12px] inline-block transition-colors"
                style={{ border: '1px solid var(--border-default)', color: 'var(--text-default)' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = 'transparent')}
              >
                GraphML (Gephi)
              </a>
              <a
                href="/api/graph/cypher"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-md text-[12px] inline-block transition-colors"
                style={{ border: '1px solid var(--border-default)', color: 'var(--text-default)' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = 'transparent')}
              >
                Cypher (Neo4j)
              </a>
            </div>
          </div>
        )}

        {section === 'schema' && (
          <div className="flex flex-col h-full">
            <div className="px-8 py-6 shrink-0">
              <h2 className="text-[16px] font-semibold mb-1" style={{ color: 'var(--text-high)' }}>
                Wiki Schema
              </h2>
              <p className="text-[12px]" style={{ color: 'var(--text-low)' }}>
                These markdown files instruct the LLM how to operate on your wiki. Edit them to customize ingest, query, and synthesis behavior.
              </p>
            </div>
            <div className="flex-1 min-h-0 px-8 pb-6">
              <div className="h-full border rounded" style={{ borderColor: 'var(--border-default)' }}>
                <SchemaSettings />
              </div>
            </div>
          </div>
        )}

        {section === 'project-schema' && (
          <div className="flex flex-col h-full">
            <SchemaSettingsView />
          </div>
        )}

        {section === 'data-location' && (
          <div className="flex flex-col h-full">
            <DataLocationView />
          </div>
        )}

        {section === 'storage' && (
          <div className="px-8 py-6 max-w-2xl">
            <h2 className="text-[16px] font-semibold mb-1" style={{ color: 'var(--text-high)' }}>
              Storage &amp; Trash
            </h2>
            <p className="text-[12px] mb-6" style={{ color: 'var(--text-low)' }}>
              Deleted notes are moved to Trash and can be restored or permanently removed.
            </p>
            <button
              onClick={() => {
                onClose();
                useCanvasRoute.getState().navigate({ kind: 'trash' });
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
              style={{
                border: '1px solid var(--border-default)',
                color: 'var(--text-default)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <Trash2 size={15} strokeWidth={1.6} />
              Open Trash
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UsernameField() {
  const [value, setValue] = useState(() => localStorage.getItem('mindbase-username') ?? '');
  const [savedValue, setSavedValue] = useState(value);
  const dirty = value !== savedValue;
  const save = () => {
    const trimmed = value.trim();
    localStorage.setItem('mindbase-username', trimmed);
    setSavedValue(trimmed);
    setValue(trimmed);
    showToast('Username saved');
  };
  return (
    <div style={{ marginBottom: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-mid)', fontSize: 12, fontWeight: 600 }}>
        MindBase username
      </label>
      <div style={{ color: 'var(--text-low)', fontSize: 11, marginBottom: 8 }}>
        Used as the contributor directory: sources/contributors/&lt;user&gt;/
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="haobing"
          style={{ padding: '6px 10px', width: 240, background: 'var(--bg-input, #111)', color: 'var(--text-high)', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 12 }}
        />
        <button
          onClick={save}
          disabled={!dirty}
          style={{ padding: '6px 14px', background: dirty ? 'var(--accent, #4a4a8a)' : 'transparent', color: dirty ? '#fff' : 'var(--text-low)', border: '1px solid var(--border-default)', borderRadius: 4, cursor: dirty ? 'pointer' : 'not-allowed', fontSize: 12 }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
