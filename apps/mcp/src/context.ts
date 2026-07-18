// apps/mcp/src/context.ts
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { FileStore, SearchIndex, FeedStore, CardStore, TemplateStore, WikiIndex, reindex, createAdapter, type LLMAdapter, type Store } from '@mindbase/core';
import { SynthesisCache } from './lib/synthesis-cache.js';

export interface MCPConfig {
  provider: 'openai' | 'anthropic' | 'deepseek' | 'ollama';
  model: string;
  apiKey: string;
  baseUrl: string;
  autoSave?: boolean;
  mergeSaves?: boolean;
  maxContextChars?: number;
}

export interface Context {
  dataDir: string;
  store: Store;
  wikiIndex: WikiIndex;
  searchIndex: SearchIndex;
  feeds: FeedStore;
  cards: CardStore;
  templates: TemplateStore;
  synthesisCache: SynthesisCache;
  config: MCPConfig | null;       // null if config file missing
  getAdapter: () => LLMAdapter;   // throws if config missing
  reindex: () => Promise<void>;
  /** Identifies the calling client if detectable (from MCP_CLIENT env var). */
  mcpClient: string;
}

function expandHome(p: string): string {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

export async function loadContext(opts: { dataDir?: string }): Promise<Context> {
  const dataDir = expandHome(opts.dataDir ?? process.env['MINDBASE_DATA_DIR'] ?? path.join(os.homedir(), 'mindbase-data'));
  await fs.mkdir(dataDir, { recursive: true });

  const store = new FileStore(dataDir);
  const feeds = new FeedStore(dataDir);
  const cards = new CardStore(dataDir);
  const templates = new TemplateStore(dataDir);
  await templates.ensureDefaults();
  const synthesisCache = new SynthesisCache(dataDir);

  let config: MCPConfig | null = null;
  try {
    const text = await fs.readFile(path.join(dataDir, 'mindbase.config.json'), 'utf-8');
    config = JSON.parse(text) as MCPConfig;
  } catch { /* ok — read-only tools still work */ }

  // Build a fresh search index from disk on each start (cheap for personal-scale wikis)
  const searchIndex = new SearchIndex();
  try {
    const entries = await store.listDir('wiki/notes');
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
      const slug = entry.name.replace(/\.md$/, '');
      const body = await store.readText(`wiki/notes/${entry.name}`);
      let title = slug;
      try {
        const meta = await store.readJSON<{ title: string }>(`wiki/notes/${slug}.meta.json`);
        title = meta.title;
      } catch { /* keep slug */ }
      searchIndex.add({ path: `wiki/notes/${slug}.md`, title, body, type: 'concept' });
    }
  } catch { /* wiki/notes may not exist yet */ }

  // Open the persistent graph index (shared path with server: <dataDir>/.index/db.sqlite).
  // Empty index → lazy reindex from disk so graph tools work even on first launch.
  const indexDir = path.join(dataDir, '.index');
  await fs.mkdir(indexDir, { recursive: true });
  const wikiIndex = WikiIndex.open(path.join(indexDir, 'db.sqlite'));

  if (wikiIndex.allPages().length === 0) {
    const r = await reindex(store, wikiIndex);
    process.stderr.write(
      `[mindbase-mcp] wiki-index initial reindex — ${r.pagesProcessed} pages, ${r.linksWritten} links, ${r.durationMs}ms\n`,
    );
  }

  return {
    dataDir,
    store,
    wikiIndex,
    searchIndex,
    feeds,
    cards,
    templates,
    synthesisCache,
    config,
    getAdapter: () => {
      if (!config) throw new Error('LLM not configured');
      return createAdapter(config.provider, {
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl || undefined,
      });
    },
    reindex: async () => {
      // Rebuild index from disk
      const fresh = new SearchIndex();
      const entries = await store.listDir('wiki/notes');
      for (const entry of entries) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
        const slug = entry.name.replace(/\.md$/, '');
        const body = await store.readText(`wiki/notes/${entry.name}`);
        let title = slug;
        try {
          const meta = await store.readJSON<{ title: string }>(`wiki/notes/${slug}.meta.json`);
          title = meta.title;
        } catch { /* keep slug */ }
        fresh.add({ path: `wiki/notes/${slug}.md`, title, body, type: 'concept' });
      }
      // Replace internal state
      Object.assign(searchIndex, fresh);
    },
    mcpClient: process.env['MCP_CLIENT'] ?? 'unknown',
  };
}

// Helper for resolving paths under a project's v2 layout.
import { join as pathJoin } from 'node:path';
import { readFile as fsReadFile } from 'node:fs/promises';

export async function currentProjectId(dataDir: string): Promise<string | null> {
  try {
    const cfg = JSON.parse(await fsReadFile(pathJoin(dataDir, 'config.json'), 'utf-8')) as { currentProjectId?: string };
    return cfg.currentProjectId ?? null;
  } catch { return null; }
}

export function projectRoot(dataDir: string, projectId: string): string {
  return pathJoin(dataDir, 'projects', projectId);
}
