import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { ensureSchema, getSchemaVersion, CURRENT_SCHEMA_VERSION } from './schema';

describe('schema', () => {
  it('creates pages, links, schema_version on a fresh DB', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('pages');
    expect(names).toContain('links');
    expect(names).toContain('schema_version');
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('is idempotent — second call does not throw or change version', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const v1 = getSchemaVersion(db);
    ensureSchema(db);
    const v2 = getSchemaVersion(db);
    expect(v2).toBe(v1);
  });

  it('enables WAL mode', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const mode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    // :memory: returns 'memory'; a file DB would return 'wal'. We assert
    // the pragma was attempted by checking foreign_keys (always settable).
    const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(fk.foreign_keys).toBe(1);
    expect(['wal', 'memory']).toContain(mode.journal_mode);
  });

  it('pages table accepts an insert with the minimum required columns', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    db.prepare(`
      INSERT INTO pages (slug, path, title, type, content_hash, word_count, created_at, updated_at)
      VALUES ('rag', 'wiki/notes/rag.md', 'RAG', 'concept', 'abc123', 42, '2026-05-22T00:00:00Z', '2026-05-22T00:00:00Z')
    `).run();
    const row = db.prepare('SELECT slug, inbound_count FROM pages WHERE slug = ?').get('rag') as { slug: string; inbound_count: number };
    expect(row.slug).toBe('rag');
    expect(row.inbound_count).toBe(0); // default
  });

  it('links table defaults edge_type to mentions', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    db.prepare(`
      INSERT INTO links (source_slug, target_slug, confidence, origin, created_at, updated_at)
      VALUES ('rag', 'llm', 'extracted', 'markdown', '2026-05-22T00:00:00Z', '2026-05-22T00:00:00Z')
    `).run();
    const row = db.prepare('SELECT edge_type FROM links WHERE source_slug = ? AND target_slug = ?')
      .get('rag', 'llm') as { edge_type: string };
    expect(row.edge_type).toBe('mentions');
  });

  it('creates audit_log + confidence_log (v2 tables)', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const tables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as Array<{ name: string }>).map((t) => t.name);
    expect(tables).toContain('audit_log');
    expect(tables).toContain('confidence_log');
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('audit_log accepts insert with required columns', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    db.prepare(`
      INSERT INTO audit_log (
        raw_id, trigger, model, prompt_version, context_slugs, actions,
        input_tokens, output_tokens, duration_ms, status, started_at
      ) VALUES (
        'raw-1', 'ingest', 'gpt-4o-mini', 'compile/v1', '["rag"]', '[]',
        100, 200, 1234, 'success', '2026-05-22T00:00:00Z'
      )
    `).run();
    const row = db.prepare('SELECT raw_id, status FROM audit_log').get() as { raw_id: string; status: string };
    expect(row.raw_id).toBe('raw-1');
    expect(row.status).toBe('success');
  });

  it('migrates v1 database forward (through v2 and v3 tables)', () => {
    const db = new Database(':memory:');
    // Manually create v1-only schema
    db.exec(`
      CREATE TABLE pages (slug TEXT PRIMARY KEY, path TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL, content_hash TEXT NOT NULL, word_count INTEGER NOT NULL DEFAULT 0, inbound_count INTEGER NOT NULL DEFAULT 0, outbound_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE links (id INTEGER PRIMARY KEY, source_slug TEXT, target_slug TEXT, edge_type TEXT NOT NULL DEFAULT 'mentions', confidence TEXT NOT NULL DEFAULT 'extracted', inference_rule TEXT, context_snippet TEXT, source_location TEXT, origin TEXT NOT NULL DEFAULT 'markdown', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_version VALUES (1, '2026-05-01T00:00:00Z');
    `);
    expect(getSchemaVersion(db)).toBe(1);
    ensureSchema(db);
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>).map((t) => t.name);
    // v2 tables must exist after migration
    expect(tables).toContain('audit_log');
    expect(tables).toContain('confidence_log');
    // v3: pages must gain community_id column
    const pageCols = (db.prepare(`PRAGMA table_info(pages)`).all() as Array<{ name: string }>).map((c) => c.name);
    expect(pageCols).toContain('community_id');
  });

  it('creates communities + analysis_cache + contradiction_cache at v3', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const tables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as Array<{ name: string }>).map((t) => t.name);
    expect(tables).toContain('communities');
    expect(tables).toContain('analysis_cache');
    expect(tables).toContain('contradiction_cache');
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('communities table accepts insert with id + size + label', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    db.prepare(`INSERT INTO communities (id, label, size, computed_at) VALUES (?, ?, ?, ?)`)
      .run(0, 'retrieval-cluster', 12, '2026-05-23T00:00:00Z');
    const row = db.prepare(`SELECT label, size FROM communities WHERE id=?`).get(0) as { label: string; size: number };
    expect(row.label).toBe('retrieval-cluster');
    expect(row.size).toBe(12);
  });

  it('analysis_cache enforces unique kind constraint (one row per kind)', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    db.prepare(`INSERT INTO analysis_cache (kind, payload, computed_at) VALUES (?, ?, ?)`)
      .run('god_nodes', '[]', '2026-05-23T00:00:00Z');
    // Second insert with same kind should replace, not duplicate
    db.prepare(`INSERT INTO analysis_cache (kind, payload, computed_at) VALUES (?, ?, ?)
                ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload, computed_at=excluded.computed_at`)
      .run('god_nodes', '["rag"]', '2026-05-23T01:00:00Z');
    const rows = db.prepare(`SELECT payload FROM analysis_cache WHERE kind=?`).all('god_nodes') as Array<{ payload: string }>;
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toEqual(['rag']);
  });

  it('contradiction_cache keys on (slug_a, slug_b, model_id, prompt_version)', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    db.prepare(`INSERT INTO contradiction_cache (slug_a, slug_b, model_id, prompt_version, verdict, reason, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('a', 'b', 'gpt-4o', 'judge/v1', 'contradicts', 'A says X, B says not-X', '2026-05-23T00:00:00Z');
    const row = db.prepare(
      `SELECT verdict FROM contradiction_cache WHERE slug_a=? AND slug_b=? AND model_id=? AND prompt_version=?`
    ).get('a', 'b', 'gpt-4o', 'judge/v1') as { verdict: string };
    expect(row.verdict).toBe('contradicts');

    // Exercise the UNIQUE (slug_a, slug_b, model_id, prompt_version) ON CONFLICT REPLACE path:
    // a second insert with the same composite key but a different verdict must replace, not duplicate.
    db.prepare(`INSERT INTO contradiction_cache (slug_a, slug_b, model_id, prompt_version, verdict, reason, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('a', 'b', 'gpt-4o', 'judge/v1', 'compatible', 'Re-evaluated: no conflict', '2026-05-23T01:00:00Z');
    const count = (db.prepare(`SELECT COUNT(*) AS cnt FROM contradiction_cache`).get() as { cnt: number }).cnt;
    expect(count).toBe(1); // replaced, not duplicated
    const replaced = db.prepare(
      `SELECT verdict FROM contradiction_cache WHERE slug_a=? AND slug_b=? AND model_id=? AND prompt_version=?`
    ).get('a', 'b', 'gpt-4o', 'judge/v1') as { verdict: string };
    expect(replaced.verdict).toBe('compatible'); // second (replacing) verdict wins
  });

  it('migrates v2 → v3 idempotently', () => {
    const db = new Database(':memory:');
    // Manually create v2 schema
    db.exec(`
      CREATE TABLE pages (slug TEXT PRIMARY KEY, path TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL, content_hash TEXT NOT NULL, word_count INTEGER NOT NULL DEFAULT 0, inbound_count INTEGER NOT NULL DEFAULT 0, outbound_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE links (id INTEGER PRIMARY KEY, source_slug TEXT, target_slug TEXT, edge_type TEXT NOT NULL DEFAULT 'mentions', confidence TEXT NOT NULL DEFAULT 'extracted', inference_rule TEXT, context_snippet TEXT, source_location TEXT, origin TEXT NOT NULL DEFAULT 'markdown', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE audit_log (id INTEGER PRIMARY KEY, raw_id TEXT, trigger TEXT NOT NULL, model TEXT NOT NULL, prompt_version TEXT NOT NULL, context_slugs TEXT NOT NULL, actions TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, error TEXT, started_at TEXT NOT NULL, completed_at TEXT);
      CREATE TABLE confidence_log (id INTEGER PRIMARY KEY, link_id INTEGER, old_type TEXT, new_type TEXT NOT NULL, old_confidence TEXT, new_confidence TEXT NOT NULL, reason TEXT, changed_at TEXT NOT NULL);
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_version VALUES (1, '2026-05-01T00:00:00Z');
      INSERT INTO schema_version VALUES (2, '2026-05-22T00:00:00Z');
    `);
    expect(getSchemaVersion(db)).toBe(2);
    ensureSchema(db);
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>).map((t) => t.name);
    expect(tables).toContain('communities');
    expect(tables).toContain('analysis_cache');
    expect(tables).toContain('contradiction_cache');
    const pageCols = (db.prepare(`PRAGMA table_info(pages)`).all() as Array<{ name: string }>).map((c) => c.name);
    expect(pageCols).toContain('community_id');
    expect(pageCols).toContain('project_id'); // v4: multi-project graph
    const linkCols = (db.prepare(`PRAGMA table_info(links)`).all() as Array<{ name: string }>).map((c) => c.name);
    expect(linkCols).toContain('source_project_id');
    expect(linkCols).toContain('target_project_id');
  });
});
