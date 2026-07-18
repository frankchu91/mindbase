import type Database from 'better-sqlite3';

export type AnalysisKind = 'god_nodes' | 'bridge_nodes' | 'orphan_clusters' | 'suggestions';

export interface AnalysisCacheEntry<T> {
  kind: AnalysisKind;
  payload: T;
  computedAt: string;
}

/**
 * Key-value cache for graph analysis results. One row per kind; put() replaces.
 */
export class AnalysisCache {
  private putStmt: Database.Statement;
  private getStmt: Database.Statement;
  private staleStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.putStmt = db.prepare(`
      INSERT INTO analysis_cache (kind, payload, computed_at) VALUES (?, ?, ?)
      ON CONFLICT(kind) DO UPDATE SET payload = excluded.payload, computed_at = excluded.computed_at
    `);
    this.getStmt = db.prepare(`SELECT kind, payload, computed_at FROM analysis_cache WHERE kind = ?`);
    this.staleStmt = db.prepare(`SELECT computed_at FROM analysis_cache WHERE kind = ?`);
  }

  put<T>(kind: AnalysisKind, payload: T): void {
    this.putStmt.run(kind, JSON.stringify(payload), new Date().toISOString());
  }

  get<T>(kind: AnalysisKind): AnalysisCacheEntry<T> | null {
    const row = this.getStmt.get(kind) as
      | { kind: AnalysisKind; payload: string; computed_at: string }
      | undefined;
    if (!row) return null;
    return { kind: row.kind, payload: JSON.parse(row.payload) as T, computedAt: row.computed_at };
  }

  /**
   * Returns true if the cache entry is missing OR older than maxAgeMs.
   * Used by the scheduler to decide whether to recompute.
   */
  isStale(kind: AnalysisKind | string, maxAgeMs: number): boolean {
    const row = this.staleStmt.get(kind) as
      | { computed_at: string }
      | undefined;
    if (!row) return true;
    const ageMs = Date.now() - Date.parse(row.computed_at);
    return ageMs > maxAgeMs;
  }
}

export type ContradictionVerdict = 'contradicts' | 'compatible' | 'unrelated';

export interface ContradictionPutInput {
  slugA: string;
  slugB: string;
  modelId: string;
  promptVersion: string;
  verdict: ContradictionVerdict;
  reason: string | null;
}

export interface ContradictionRecord {
  id: number;
  slugA: string;
  slugB: string;
  modelId: string;
  promptVersion: string;
  verdict: ContradictionVerdict;
  reason: string | null;
  computedAt: string;
}

/**
 * Cache for LLM-judged contradiction verdicts. Keyed by
 * (slug_a, slug_b, model_id, prompt_version) so prompt changes don't
 * invalidate the whole cache.
 */
export class ContradictionCache {
  private putStmt: Database.Statement;
  private getStmt: Database.Statement;
  private listConfirmedStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.putStmt = db.prepare(`
      INSERT INTO contradiction_cache (slug_a, slug_b, model_id, prompt_version, verdict, reason, computed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug_a, slug_b, model_id, prompt_version) DO UPDATE SET
        verdict = excluded.verdict,
        reason = excluded.reason,
        computed_at = excluded.computed_at
    `);
    this.getStmt = db.prepare(`
      SELECT id, slug_a, slug_b, model_id, prompt_version, verdict, reason, computed_at
      FROM contradiction_cache
      WHERE slug_a = ? AND slug_b = ? AND model_id = ? AND prompt_version = ?
    `);
    this.listConfirmedStmt = db.prepare(`
      SELECT id, slug_a, slug_b, model_id, prompt_version, verdict, reason, computed_at
      FROM contradiction_cache
      WHERE verdict = 'contradicts'
      ORDER BY computed_at DESC
    `);
  }

  put(input: ContradictionPutInput): void {
    const now = new Date().toISOString();
    this.putStmt.run(input.slugA, input.slugB, input.modelId, input.promptVersion, input.verdict, input.reason, now);
  }

  get(slugA: string, slugB: string, modelId: string, promptVersion: string): ContradictionRecord | null {
    const row = this.getStmt.get(slugA, slugB, modelId, promptVersion) as
      | { id: number; slug_a: string; slug_b: string; model_id: string; prompt_version: string; verdict: ContradictionVerdict; reason: string | null; computed_at: string }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      slugA: row.slug_a, slugB: row.slug_b,
      modelId: row.model_id, promptVersion: row.prompt_version,
      verdict: row.verdict, reason: row.reason ?? null, computedAt: row.computed_at,
    };
  }

  /** Return all rows where verdict='contradicts'. Used by the UI surface. */
  listConfirmed(): ContradictionRecord[] {
    const rows = this.listConfirmedStmt.all() as Array<{ id: number; slug_a: string; slug_b: string; model_id: string; prompt_version: string; verdict: ContradictionVerdict; reason: string | null; computed_at: string }>;
    return rows.map((r) => ({
      id: r.id,
      slugA: r.slug_a, slugB: r.slug_b,
      modelId: r.model_id, promptVersion: r.prompt_version,
      verdict: r.verdict, reason: r.reason ?? null, computedAt: r.computed_at,
    }));
  }
}
