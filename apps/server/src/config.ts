import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ProviderName } from '@mindbase/core';

export interface DailyBriefConfig {
  enabled: boolean;
  time: string;           // "HH:MM" 24h, e.g. "09:00"
  timezone: string;       // IANA tz, e.g. "America/Los_Angeles"
  email: string;          // recipient address
  publicUrl?: string;     // used for clickable links (defaults to http://localhost:4321)
  smtp: {
    host: string;
    port: number;
    secure: boolean;      // true for 465, false for 587 + STARTTLS
    user: string;
    pass: string;         // app-specific password preferred (Gmail/Fastmail/etc)
    from?: string;        // optional From header override (default: smtp.user)
  };
  includeOnThisDay: boolean;  // include 1w/1m/1y ago section
  includeQuiz: boolean;        // include simple recall quiz
  manualOnly: boolean;         // skip cron, only generate on demand (testing-friendly default)
}

export interface RssConfig {
  enabled: boolean;
  intervalMinutes: number;       // default 60
  fetchTimeoutMs: number;        // default 15000
  fetchUserAgent: string;        // default 'MindBase/0.1'
  readabilityEnabled: boolean;   // default true
}

export interface SrsConfig {
  enabled: boolean;
  autoExtract: boolean;             // default true
  extractionModel?: string;
  cardsPerPage: number;             // default 3
  extractionIntervalHours: number;  // default 6
  newCardsPerDayLimit: number;      // default 20
}

export interface AtlasConfig {
  provider: ProviderName;
  model: string;
  apiKey: string;
  baseUrl: string;
  /** Optional Brave Search API key — enables web results in /research. */
  braveApiKey?: string;
  autoSave: boolean;      // LLM auto-saves insights silently
  mergeSaves: boolean;     // Merge multiple saves in same chat session into one note
  maxContextChars: number; // Max chars of source content to send to LLM (depends on model context window)
  googleTokens?: {
    access_token: string;
    refresh_token: string;
    expiry: string;
  };
  googleSyncFolderId?: string;
  googleSyncFolderName?: string;
  dailyBrief?: DailyBriefConfig;
  rss?: RssConfig;
  srs?: SrsConfig;
}

const DEFAULT_CONFIG: AtlasConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: '',
  baseUrl: '',
  autoSave: true,
  mergeSaves: false,
  maxContextChars: 50000,
};

/**
 * Path to the server-level preference file holding the user's chosen data
 * directory. Lives OUTSIDE the data dir itself (chicken-and-egg: we need to
 * know where the data dir is before we can read anything in it).
 */
export function serverPrefsPath(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, 'mindbase', 'server.json');
}

interface ServerPrefs {
  dataDir?: string;
}

async function readServerPrefs(): Promise<ServerPrefs> {
  try {
    const text = await fs.readFile(serverPrefsPath(), 'utf-8');
    const parsed = JSON.parse(text) as ServerPrefs;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeServerPrefs(prefs: ServerPrefs): Promise<void> {
  const p = serverPrefsPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(prefs, null, 2), 'utf-8');
}

/**
 * Resolve the active data directory. Precedence:
 *   1. MINDBASE_DATA_DIR env var (highest — for ops / scripts)
 *   2. ~/.config/mindbase/server.json `dataDir` (UI-settable)
 *   3. ~/mindbase-data (default)
 */
export async function resolveDataDirAsync(): Promise<string> {
  const fromEnv = process.env['MINDBASE_DATA_DIR'];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const prefs = await readServerPrefs();
  if (prefs.dataDir && prefs.dataDir.length > 0) {
    return prefs.dataDir.startsWith('~')
      ? path.join(os.homedir(), prefs.dataDir.slice(1))
      : prefs.dataDir;
  }
  return path.join(os.homedir(), 'mindbase-data');
}

function resolveDataDir(): string {
  // Sync fallback — used only when async resolution hasn't been wired through.
  return process.env['MINDBASE_DATA_DIR'] ?? path.join(os.homedir(), 'mindbase-data');
}

function configPath(dataDir: string): string {
  return path.join(dataDir, 'mindbase.config.json');
}

export async function loadConfig(dataDir?: string): Promise<{ config: AtlasConfig; dataDir: string }> {
  const dir = dataDir ?? resolveDataDir();
  await fs.mkdir(dir, { recursive: true });
  const cfgPath = configPath(dir);
  try {
    const text = await fs.readFile(cfgPath, 'utf-8');
    const parsed = JSON.parse(text) as Partial<AtlasConfig>;
    return { config: { ...DEFAULT_CONFIG, ...parsed }, dataDir: dir };
  } catch {
    await fs.writeFile(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    return { config: { ...DEFAULT_CONFIG }, dataDir: dir };
  }
}

export async function saveConfig(dataDir: string, config: AtlasConfig): Promise<void> {
  const cfgPath = configPath(dataDir);
  await fs.writeFile(cfgPath, JSON.stringify(config, null, 2), 'utf-8');
}
