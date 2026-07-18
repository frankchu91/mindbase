import {
  FileStore, SearchIndex, EmbeddingStore, createAdapter, FeedStore, CardStore,
  WikiIndex, reindex, reindexAllProjects, reclassify, ensureInbox, ensureDefaultRules,
  NoopOCRAdapter, paths, ensureSchema as ensureWikiSchema,
  ProjectScopedStore, migrateLegacyData,
  type Store, type LLMAdapter, type RawDoc, type ChatRequest, type ChatChunk,
  type OCRAdapter,
} from '@mindbase/core';
import { TesseractWasmAdapter } from './lib/ocr-tesseract';
import { loadConfig, saveConfig, type AtlasConfig } from './config';
import { ensureSchema } from './schema';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Inbox } from './lib/inbox';
import { DeviceStore } from './lib/devices';
import { TemplateStore } from '@mindbase/core';
import { SynthesisCache } from './lib/synthesis-cache';
import type { CaptureWorker } from './lib/capture-worker';
import type { BriefScheduler } from './lib/brief-scheduler';
import type { RSSWorker } from './lib/rss-worker';
import type { SRSExtractor } from './lib/srs-worker';
import type { EmbeddingIndexer } from './lib/embedding-indexer';
import type { SynthesisWorker } from './lib/synthesis-worker';

export interface ServerContext {
  store: Store;
  /** The unscoped FileStore — needed by /api/projects for cross-project ops. */
  rawStore: Store;
  /** Which project the server is currently bound to. */
  currentProjectId: string;
  wikiIndex: WikiIndex;
  searchIndex: SearchIndex;
  embeddingStore: EmbeddingStore;
  config: AtlasConfig;
  dataDir: string;
  inbox: Inbox;
  devices: DeviceStore;
  feeds: FeedStore;
  cards: CardStore;
  templates: TemplateStore;
  synthesisCache: SynthesisCache;
  ocrAdapter: OCRAdapter;
  /** Assigned in index.ts after ctx is created to avoid circular construction. */
  captureWorker?: CaptureWorker;
  /** Assigned in index.ts after ctx is created to avoid circular construction. */
  briefScheduler?: BriefScheduler;
  /** Assigned in index.ts after ctx is created to avoid circular construction. */
  rssWorker?: RSSWorker;
  /** Assigned in index.ts after ctx is created to avoid circular construction. */
  srsExtractor?: SRSExtractor;
  /** Assigned in index.ts after ctx is created to avoid circular construction. */
  embeddingIndexer?: EmbeddingIndexer;
  /** Assigned in index.ts after ctx is created to avoid circular construction. */
  synthesisWorker?: SynthesisWorker;
  getAdapter: () => LLMAdapter;
  reloadConfig: () => Promise<void>;
  saveConfig: (config: AtlasConfig) => Promise<void>;
  persistIndex: () => Promise<void>;
  reindexWiki: () => Promise<void>;
  findRawDoc: (rawId: string) => Promise<RawDoc | null>;
  /** Atomically swap the current project: re-wrap store, persist to config.json, reindex. */
  switchProject(id: string): Promise<void>;
}

async function readBodyWithOcr(store: Store, mdBody: string): Promise<string> {
  const re = /\/api\/wiki\/attachments\/([^/)\s]+)\/([0-9a-f]+\.(?:png|jpg|jpeg|gif|webp))/gi;
  const matches = Array.from(mdBody.matchAll(re));
  if (matches.length === 0) return mdBody;
  const blocks: string[] = [];
  for (const m of matches) {
    const slugDir = m[1]!;
    const file = m[2]!;
    try {
      const txt = await store.readText(`attachments/${slugDir}/${file}.ocr.txt`);
      if (txt.trim().length > 0) blocks.push(txt.trim());
    } catch { /* skip */ }
  }
  return blocks.length > 0 ? `${mdBody}\n\n${blocks.join('\n\n')}` : mdBody;
}

export async function createContext(dataDir?: string): Promise<ServerContext> {
  const loaded = await loadConfig(dataDir);
  let config = loaded.config;
  const dir = loaded.dataDir;
  const rawStore: Store = new FileStore(dir);

  // 1. Load currentProjectId from config.json (unscoped — config is global).
  let currentProjectId = 'default';
  try {
    const cfg = await rawStore.readJSON<{ currentProjectId?: string }>('config.json');
    if (cfg.currentProjectId && typeof cfg.currentProjectId === 'string') {
      currentProjectId = cfg.currentProjectId;
    }
  } catch {
    // config.json missing — first boot, keep 'default'
  }

  // 2. Run legacy migration (idempotent — bails if projects/default/meta.json exists).
  const migration = await migrateLegacyData(rawStore);
  if (migration.ran) {
    console.log(`[migration] ${migration.reason ?? 'completed'} (${migration.movedFiles} files moved)`);
  }

  // 3. Wrap the store so all subsequent code reads/writes are project-scoped.
  // Declared with `let` so switchProject can swap it to a different project.
  let store: Store = new ProjectScopedStore(rawStore, currentProjectId);

  // Ensure schema/ directory exists with defaults
  await ensureSchema(store);

  // Load or create search index. If the on-disk index is from an older
  // tokenizer version (or corrupt, or missing), start fresh — the wiki files
  // themselves are the source of truth and reindexWiki() will rebuild
  // lazily on the next call. Distinguish ENOENT (no file yet) from version
  // mismatch (delete the stale file so the next save writes a clean one).
  const indexPath = path.join(dir, 'meta', 'search-index.json');
  let searchIndex: SearchIndex;
  try {
    const serialized = await fs.readFile(indexPath, 'utf-8');
    searchIndex = SearchIndex.load(serialized);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      searchIndex = new SearchIndex();
    } else {
      console.warn(
        `[context] search index incompatible (${(err as Error).message}); rebuilding from wiki files`,
      );
      await fs.unlink(indexPath).catch(() => {});
      searchIndex = new SearchIndex();
    }
  }

  // In-memory index: rawId → "raw/date/id" prefix (no extension)
  let rawIndex: Map<string, string> | null = null;

  async function buildRawIndex(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const dates = await store.listDir('raw');
      for (const d of dates) {
        if (d.kind !== 'directory') continue;
        const files = await store.listDir(`raw/${d.name}`);
        for (const f of files) {
          if (f.kind !== 'file' || !f.name.endsWith('.meta.json')) continue;
          const id = f.name.replace('.meta.json', '');
          map.set(id, `raw/${d.name}/${id}`);
        }
      }
    } catch { /* raw/ doesn't exist yet */ }
    return map;
  }

  const inbox = new Inbox(dir);
  const devices = new DeviceStore(dir);
  const feeds = new FeedStore(dir);
  const cards = new CardStore(dir);
  const templates = new TemplateStore(dir);
  await templates.ensureDefaults();
  const synthesisCache = new SynthesisCache(dir);
  const embeddingStore = new EmbeddingStore(dir);

  // Open the persistent graph index. Markdown remains the SoT; this is a
  // derived cache. Empty index → lazy reindex from disk.
  const indexDir = path.join(dir, '.index');
  await fs.mkdir(indexDir, { recursive: true });
  const wikiIndex = WikiIndex.open(path.join(indexDir, 'db.sqlite'));

  if (wikiIndex.allPages().length === 0) {
    console.log('[wiki-index] empty index detected — running initial reindex across all projects…');
    const r = await reindexAllProjects(rawStore, wikiIndex);
    console.log(
      `[wiki-index] reindex complete — ${r.projectCount} project(s), ` +
      `${r.pagesProcessed} pages, ${r.linksWritten} links, ${r.durationMs}ms`,
    );
  }

  // Phase 2 backfill: if any link still has the Phase-1 default state
  // (edge_type='mentions' AND inference_rule IS NULL), this index predates
  // Phase 2 — run the classifier once across all pages. Idempotent.
  if (wikiIndex.hasUntypedLinks()) {
    console.log('[wiki-index] Phase 2 edge-type backfill needed — running reclassify…');
    const r = await reclassify(store, wikiIndex);
    console.log(
      `[wiki-index] reclassify complete — ${r.pagesProcessed} pages, ` +
      `${r.linksUpdated} links updated, ${r.durationMs}ms`,
    );
  }

  // Ensure the classify subsystem has its baseline files: Inbox folder exists
  // and a starter classify-rules.md is in place. Both are idempotent.
  await ensureInbox(store);
  await ensureDefaultRules(store);
  // Karpathy 3-layer: the user-editable schema lives at wiki/schema.md.
  // Scaffold a sensible default on first boot.
  await ensureWikiSchema(store);

  // OCR backend selection: env override -> tesseract by default.
  const ocrAdapter: OCRAdapter =
    process.env['MINDBASE_OCR'] === 'off'
      ? new NoopOCRAdapter()
      : new TesseractWasmAdapter();

  const ctx: ServerContext = {
    store,
    rawStore,
    currentProjectId,
    wikiIndex,
    searchIndex,
    embeddingStore,
    config,
    dataDir: dir,
    inbox,
    devices,
    feeds,
    cards,
    templates,
    synthesisCache,
    ocrAdapter,
    getAdapter: () => {
      // MOCK_LLM=1 → return a deterministic mock adapter for integration tests
      // (also used by Playwright webServer)
      if (process.env['MOCK_LLM'] === '1') {
        return {
          name: 'openai' as const,
          supportsTools: false,
          estimateTokens: (text: string) => Math.ceil(text.length / 4),
          testConnection: async () => ({ ok: true }),
          async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
            const rawContent = req.messages.find((m) => m.role === 'user')?.content;
            const userMsg = typeof rawContent === 'string' ? rawContent : '';
            if (userMsg.includes('Raw id:')) {
              const m = userMsg.match(/Raw id:\s*(\S+)/);
              const rawId = m?.[1] ?? 'unknown';
              yield { kind: 'delta' as const, text: `\`\`\`json\n[{"action":"create_concept","name":"Compiled Page","one_liner":"Mock compiled","initial_content":"This is mock compiled content with enough length for the system.","raw_id":"${rawId}"}]\n\`\`\`` };
              yield { kind: 'done' as const, usage: { input_tokens: 100, output_tokens: 50 } };
              return;
            }
            yield { kind: 'delta' as const, text: 'Mock LLM response.' };
            yield { kind: 'done' as const, usage: { input_tokens: 10, output_tokens: 5 } };
          },
        } as LLMAdapter;
      }
      return createAdapter(config.provider, {
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl || undefined,
      });
    },
    reloadConfig: async () => {
      const reloaded = await loadConfig(dir);
      config = reloaded.config;
      ctx.config = config;
    },
    saveConfig: async (newConfig: AtlasConfig) => {
      config = newConfig;
      ctx.config = config;
      await saveConfig(dir, config);
      // Reschedule the brief cron whenever config is saved
      ctx.briefScheduler?.reschedule();
    },
    persistIndex: async () => {
      await fs.mkdir(path.join(dir, 'meta'), { recursive: true });
      await fs.writeFile(indexPath, searchIndex.serialize(), 'utf-8');
    },
    findRawDoc: async (rawId: string) => {
      if (!rawIndex) rawIndex = await buildRawIndex();
      let prefix = rawIndex.get(rawId);
      if (!prefix) {
        // Refresh index in case it was ingested after boot
        rawIndex = await buildRawIndex();
        prefix = rawIndex.get(rawId);
      }
      if (!prefix) return null;
      const meta = await store.readJSON<{
        id: string;
        title: string;
        source_url: string | null;
        captured_at: string;
        binary_path?: string;
        binary_mime?: string;
      }>(`${prefix}.meta.json`);
      const content = await store.readText(`${prefix}.md`);

      // Recover binary fields: prefer meta.json values, fallback to probing
      // common extensions alongside the .md (handles docs imported before
      // binary_path was persisted to meta).
      let binary_path = meta.binary_path;
      let binary_mime = meta.binary_mime;
      if (!binary_path) {
        // Probe BOTH the new `<id>.<ext>` convention (ingestPaste) and the
        // legacy `<id>.original.<ext>` convention (saveOriginalFile pre-fix).
        const probes: Array<{ ext: string; mime: string }> = [
          { ext: 'pdf', mime: 'application/pdf' },
          { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
          { ext: 'doc', mime: 'application/msword' },
          { ext: 'epub', mime: 'application/epub+zip' },
        ];
        for (const p of probes) {
          for (const cand of [`${prefix}.${p.ext}`, `${prefix}.original.${p.ext}`]) {
            if (await store.exists(cand)) {
              binary_path = cand;
              binary_mime = p.mime;
              break;
            }
          }
          if (binary_path) break;
        }
      }

      return {
        id: meta.id,
        title: meta.title,
        content,
        source_url: meta.source_url,
        captured_at: meta.captured_at,
        path: prefix,
        images: [],
        ...(binary_path ? { binary_path, binary_mime } : {}),
      };
    },
    reindexWiki: async () => {
      // Two indexes derive from disk and need refreshing after any mutation:
      //   1. SearchIndex (MiniSearch) — drives BM25 candidate retrieval
      //   2. WikiIndex (SQLite graph) — drives compile-context page lookup + edges
      // If either falls behind, the next compile gets stale candidates and
      // freshly created concept pages disappear from the LLM's view.
      const notes = await paths.listAllWikiPages(store);
      for (const entry of notes) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
        const filePath = `wiki/${entry.layer}/${entry.name}`;
        const body = await store.readText(filePath);
        const enrichedBody = await readBodyWithOcr(store, body);
        const slug = entry.name.replace(/\.md$/, '');
        let title = slug;
        try {
          const meta = await store.readJSON<{ title: string }>(`wiki/${entry.layer}/${slug}.meta.json`);
          title = meta.title;
        } catch { /* keep slug */ }
        searchIndex.add({ path: filePath, title, body: enrichedBody, type: 'concept' });
      }
      await ctx.persistIndex();
      // Rebuild WikiIndex pages + links from disk for THIS project. Other
      // projects' pages stay in the unified graph untouched.
      await reindex(store, wikiIndex, currentProjectId);
    },
    switchProject: async (newId: string) => {
      // Swap the project-scoped store so all route handlers immediately
      // read/write the new project. The `store` closure variable is `let`
      // so this mutation is visible to every closure that captures it.
      store = new ProjectScopedStore(rawStore, newId);
      currentProjectId = newId;
      ctx.store = store;
      ctx.currentProjectId = newId;

      // Persist the selection to config.json (unscoped global config).
      let cfg: Record<string, unknown> = {};
      try {
        cfg = await rawStore.readJSON<Record<string, unknown>>('config.json');
      } catch { /* config.json may not exist yet */ }
      cfg['currentProjectId'] = newId;
      await rawStore.writeJSON('config.json', cfg);

      // Unified graph: wikiIndex already has every project's pages, so the
      // expensive rebuild is gone. We still rebuild the project-local
      // searchIndex (BM25 candidates) since that remains scoped to view.
      await ctx.reindexWiki();
    },
  };

  return ctx;
}

// Layout v2 detection + project root resolution.
// Added for v2 migration. Coexists with legacy v1 (wiki/-based) projects.
import { join as v2Join } from 'node:path';
import { readFile as v2ReadFile } from 'node:fs/promises';

export async function currentProjectIdFromConfig(dataDir: string): Promise<string | null> {
  try {
    const cfg = JSON.parse(await v2ReadFile(v2Join(dataDir, 'config.json'), 'utf-8')) as { currentProjectId?: string };
    return cfg.currentProjectId ?? null;
  } catch { return null; }
}

export function projectRoot(dataDir: string, projectId: string): string {
  return v2Join(dataDir, 'projects', projectId);
}

/** Detect layout version: returns 'v2' if README.md exists at project root, else 'v1' (legacy wiki/). */
export async function detectLayoutVersion(projectRoot: string): Promise<'v1' | 'v2'> {
  try {
    await v2ReadFile(v2Join(projectRoot, 'README.md'), 'utf-8');
    return 'v2';
  } catch { return 'v1'; }
}
