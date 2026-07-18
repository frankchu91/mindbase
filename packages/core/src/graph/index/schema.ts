import type Database from 'better-sqlite3';

export const CURRENT_SCHEMA_VERSION = 5;

type Migration = string | ((db: Database.Database) => void);

const MIGRATIONS: Record<number, Migration> = {
  1: `
    CREATE TABLE IF NOT EXISTS pages (
      slug              TEXT PRIMARY KEY,
      path              TEXT NOT NULL,
      title             TEXT NOT NULL,
      type              TEXT NOT NULL,
      kind              TEXT,
      content_hash      TEXT NOT NULL,
      word_count        INTEGER NOT NULL DEFAULT 0,
      inbound_count     INTEGER NOT NULL DEFAULT 0,
      outbound_count    INTEGER NOT NULL DEFAULT 0,
      tags              TEXT,                       -- JSON array
      visibility        TEXT,
      project           TEXT,
      summary           TEXT,
      meta              TEXT,                       -- JSON dump
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pages_type ON pages(type);
    CREATE INDEX IF NOT EXISTS idx_pages_updated ON pages(updated_at);

    CREATE TABLE IF NOT EXISTS links (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      source_slug       TEXT NOT NULL,
      target_slug       TEXT NOT NULL,
      edge_type         TEXT NOT NULL DEFAULT 'mentions',
      confidence        TEXT NOT NULL DEFAULT 'extracted',
      inference_rule    TEXT,
      context_snippet   TEXT,
      source_location   TEXT,
      origin            TEXT NOT NULL DEFAULT 'markdown',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      UNIQUE (source_slug, target_slug, edge_type, origin) ON CONFLICT REPLACE
    );
    CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_slug);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_slug);
    CREATE INDEX IF NOT EXISTS idx_links_type ON links(edge_type);

    CREATE TABLE IF NOT EXISTS schema_version (
      version           INTEGER PRIMARY KEY,
      applied_at        TEXT NOT NULL
    );
  `,

  2: `
    CREATE TABLE IF NOT EXISTS audit_log (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_id            TEXT,
      trigger           TEXT NOT NULL,
      model             TEXT NOT NULL,
      prompt_version    TEXT NOT NULL,
      context_slugs     TEXT NOT NULL,
      actions           TEXT NOT NULL,
      input_tokens      INTEGER NOT NULL DEFAULT 0,
      output_tokens     INTEGER NOT NULL DEFAULT 0,
      duration_ms       INTEGER NOT NULL DEFAULT 0,
      status            TEXT NOT NULL,
      error             TEXT,
      started_at        TEXT NOT NULL,
      completed_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_started ON audit_log(started_at);
    CREATE INDEX IF NOT EXISTS idx_audit_raw ON audit_log(raw_id);
    CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_log(status);

    CREATE TABLE IF NOT EXISTS confidence_log (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id           INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
      old_type          TEXT,
      new_type          TEXT NOT NULL,
      old_confidence    TEXT,
      new_confidence    TEXT NOT NULL,
      reason            TEXT,
      changed_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_confidence_link ON confidence_log(link_id);
  `,

  3: `
    CREATE TABLE IF NOT EXISTS communities (
      id                INTEGER PRIMARY KEY,
      label             TEXT,
      size              INTEGER NOT NULL DEFAULT 0,
      computed_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_cache (
      kind              TEXT PRIMARY KEY,        -- 'god_nodes' | 'bridge_nodes' | 'orphan_clusters' | 'suggestions'
      payload           TEXT NOT NULL,           -- JSON
      computed_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contradiction_cache (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      slug_a            TEXT NOT NULL,
      slug_b            TEXT NOT NULL,
      model_id          TEXT NOT NULL,
      prompt_version    TEXT NOT NULL,
      verdict           TEXT NOT NULL,           -- 'contradicts' | 'compatible' | 'unrelated'
      reason            TEXT,
      computed_at       TEXT NOT NULL,
      UNIQUE (slug_a, slug_b, model_id, prompt_version) ON CONFLICT REPLACE
    );
    CREATE INDEX IF NOT EXISTS idx_contradiction_verdict ON contradiction_cache(verdict);
    CREATE INDEX IF NOT EXISTS idx_contradiction_pair ON contradiction_cache(slug_a, slug_b);

    -- Phase 4: per-page community assignment. Added in v3 because earlier
    -- plans assumed this existed; making it explicit + safe-additive here.
    ALTER TABLE pages ADD COLUMN community_id INTEGER;
    CREATE INDEX IF NOT EXISTS idx_pages_community ON pages(community_id);
  `,

  4: `
    -- Multi-project graph: pages and links carry the project they live in,
    -- enabling cross-project [[lotr/Aragorn]] links and a unified graph view.
    -- The legacy 'project' column on pages (a per-page user tag) is kept
    -- as-is; this new column 'project_id' is the OWNING project's directory id.
    ALTER TABLE pages ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default';
    CREATE INDEX IF NOT EXISTS idx_pages_project_id ON pages(project_id);

    -- For each link, capture the project on each side. NULL target_project_id
    -- means the link is intra-project (back-compat: old links auto-resolve to
    -- the source's project). When non-NULL, it's an explicit cross-project
    -- reference and graph rendering should style it differently.
    ALTER TABLE links ADD COLUMN source_project_id TEXT NOT NULL DEFAULT 'default';
    ALTER TABLE links ADD COLUMN target_project_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_links_source_project ON links(source_project_id);
    CREATE INDEX IF NOT EXISTS idx_links_target_project ON links(target_project_id);

    -- The UNIQUE constraint on links must now include source_project so that
    -- two different projects can each have their own (source_slug, target_slug)
    -- edge without colliding. SQLite needs a table rebuild for this.
    CREATE TABLE links_new (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      source_slug       TEXT NOT NULL,
      target_slug       TEXT NOT NULL,
      edge_type         TEXT NOT NULL DEFAULT 'mentions',
      confidence        TEXT NOT NULL DEFAULT 'extracted',
      inference_rule    TEXT,
      context_snippet   TEXT,
      source_location   TEXT,
      origin            TEXT NOT NULL DEFAULT 'markdown',
      source_project_id TEXT NOT NULL DEFAULT 'default',
      target_project_id TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      UNIQUE (source_project_id, source_slug, target_slug, edge_type, origin) ON CONFLICT REPLACE
    );
    INSERT INTO links_new (
      id, source_slug, target_slug, edge_type, confidence,
      inference_rule, context_snippet, source_location, origin,
      source_project_id, target_project_id, created_at, updated_at
    )
    SELECT id, source_slug, target_slug, edge_type, confidence,
           inference_rule, context_snippet, source_location, origin,
           'default', NULL, created_at, updated_at
    FROM links;
    DROP TABLE links;
    ALTER TABLE links_new RENAME TO links;
    CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_slug);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_slug);
    CREATE INDEX IF NOT EXISTS idx_links_type ON links(edge_type);
    CREATE INDEX IF NOT EXISTS idx_links_source_project ON links(source_project_id);
    CREATE INDEX IF NOT EXISTS idx_links_target_project ON links(target_project_id);
  `,

  5: (db) => {
    // Databases created before the nullable metadata columns were folded into
    // migration 1 (kind, tags, visibility, project, summary, meta) don't have
    // them — ALTER them in first so the rebuild's SELECT below can't hit
    // "no such column" on an upgrading install.
    const existing = new Set(
      (db.prepare(`PRAGMA table_info(pages)`).all() as Array<{ name: string }>).map((c) => c.name),
    );
    for (const col of ['kind', 'tags', 'visibility', 'project', 'summary', 'meta']) {
      if (!existing.has(col)) db.exec(`ALTER TABLE pages ADD COLUMN ${col} TEXT`);
    }
    db.exec(`
    -- Two projects can have a page with the same slug (e.g. both define a
    -- "harper-insurance" page) — that's the whole point of multi-project. v4
    -- left pages.slug as PRIMARY KEY, which silently overwrote the first
    -- project's row when the second project's page indexed. Replace it with
    -- a composite (project_id, slug) primary key.
    CREATE TABLE pages_new (
      project_id        TEXT NOT NULL DEFAULT 'default',
      slug              TEXT NOT NULL,
      path              TEXT NOT NULL,
      title             TEXT NOT NULL,
      type              TEXT NOT NULL,
      kind              TEXT,
      content_hash      TEXT NOT NULL,
      word_count        INTEGER NOT NULL DEFAULT 0,
      inbound_count     INTEGER NOT NULL DEFAULT 0,
      outbound_count    INTEGER NOT NULL DEFAULT 0,
      tags              TEXT,
      visibility        TEXT,
      project           TEXT,
      summary           TEXT,
      meta              TEXT,
      community_id      INTEGER,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      PRIMARY KEY (project_id, slug)
    );
    INSERT INTO pages_new
      SELECT project_id, slug, path, title, type, kind, content_hash, word_count,
             inbound_count, outbound_count, tags, visibility, project, summary,
             meta, community_id, created_at, updated_at
      FROM pages;
    DROP TABLE pages;
    ALTER TABLE pages_new RENAME TO pages;
    CREATE INDEX IF NOT EXISTS idx_pages_type ON pages(type);
    CREATE INDEX IF NOT EXISTS idx_pages_updated ON pages(updated_at);
    CREATE INDEX IF NOT EXISTS idx_pages_project_id ON pages(project_id);
    CREATE INDEX IF NOT EXISTS idx_pages_community ON pages(community_id);
    -- Also keep slug-only lookups fast for legacy callers that query by slug
    -- without a project filter.
    CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
    `);
  },
};

export function getSchemaVersion(db: Database.Database): number {
  // Bootstrapping: if schema_version table doesn't exist yet, version is 0.
  const hasTable = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'`
  ).get();
  if (!hasTable) return 0;
  const row = db.prepare(
    `SELECT MAX(version) as v FROM schema_version`
  ).get() as { v: number | null };
  return row.v ?? 0;
}

/**
 * Apply any pending migrations to bring the database up to CURRENT_SCHEMA_VERSION.
 * Idempotent — safe to call on every startup.
 *
 * Also sets pragmas: WAL journal mode, foreign keys on, synchronous=NORMAL
 * (sufficient durability for derived index; markdown is the SoT).
 */
export function ensureSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  const current = getSchemaVersion(db);
  if (current >= CURRENT_SCHEMA_VERSION) return;

  const apply = db.transaction(() => {
    for (let v = current + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      const migration = MIGRATIONS[v];
      if (!migration) throw new Error(`Missing migration for version ${v}`);
      if (typeof migration === 'string') db.exec(migration);
      else migration(db);
      db.prepare(
        `INSERT INTO schema_version (version, applied_at) VALUES (?, ?)`
      ).run(v, new Date().toISOString());
    }
  });
  apply();
}
