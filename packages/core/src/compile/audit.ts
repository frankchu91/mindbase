import type Database from 'better-sqlite3';

export interface StartAuditOptions {
  rawId: string | null;
  trigger: 'ingest' | 'manual' | 'reindex' | 'maintenance';
  model: string;
  promptVersion: string;
  contextSlugs: string[];
}

export interface CompleteAuditOptions {
  actions: CompileAction[];
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: 'success' | 'partial' | 'error';
  error?: string;
}

/**
 * The structured action shape the compile orchestrator emits. Phase 3 supports
 * 7 kinds. Audit log persists them as JSON.
 */
export type CompileAction =
  | { kind: 'propose_edit'; slug: string; section_anchor: string; new_content: string; reason: string }
  | { kind: 'create_concept'; slug: string; name: string; one_liner: string; initial_content: string; reason: string }
  | { kind: 'link'; from: string; to: string; type: string; reason: string }
  | { kind: 'flag_contradiction'; slug_a: string; slug_b: string; reason: string }
  | { kind: 'merge'; keep: string; absorb: string; reason: string; status?: 'queued_for_review' | 'applied' }
  | { kind: 'append_to_concept'; concept_name: string; section: string; content: string; reason: string }
  | { kind: 'skip'; reason: string };

export interface AuditEntry {
  id: number;
  rawId: string | null;
  trigger: string;
  model: string;
  promptVersion: string;
  contextSlugs: string[];
  actions: CompileAction[];
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface AuditRawRow {
  id: number;
  raw_id: string | null;
  trigger: string;
  model: string;
  prompt_version: string;
  context_slugs: string;
  actions: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  status: string;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

function parseRow(r: AuditRawRow): AuditEntry {
  return {
    id: r.id,
    rawId: r.raw_id,
    trigger: r.trigger,
    model: r.model,
    promptVersion: r.prompt_version,
    contextSlugs: JSON.parse(r.context_slugs) as string[],
    actions: JSON.parse(r.actions) as CompileAction[],
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    durationMs: r.duration_ms,
    status: r.status,
    error: r.error,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

/**
 * Audit log writer + reader. Lifecycle: startAudit() → completeAudit().
 * Reads via listRecent() and getById() for the UI.
 *
 * Rows are intentionally append-only — once completed, they're never updated.
 * The `pending` status only exists between startAudit and completeAudit;
 * a process crash leaves a pending row visible in the UI for debugging.
 */
export class AuditLogWriter {
  constructor(private db: Database.Database) {}

  startAudit(opts: StartAuditOptions): number {
    const now = new Date().toISOString();
    const info = this.db.prepare(`
      INSERT INTO audit_log (
        raw_id, trigger, model, prompt_version, context_slugs, actions,
        input_tokens, output_tokens, duration_ms, status, started_at
      ) VALUES (?, ?, ?, ?, ?, '[]', 0, 0, 0, 'pending', ?)
    `).run(
      opts.rawId,
      opts.trigger,
      opts.model,
      opts.promptVersion,
      JSON.stringify(opts.contextSlugs),
      now,
    );
    return info.lastInsertRowid as number;
  }

  completeAudit(id: number, opts: CompleteAuditOptions): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE audit_log SET
        actions = ?,
        input_tokens = ?,
        output_tokens = ?,
        duration_ms = ?,
        status = ?,
        error = ?,
        completed_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(opts.actions),
      opts.inputTokens,
      opts.outputTokens,
      opts.durationMs,
      opts.status,
      opts.error ?? null,
      now,
      id,
    );
  }

  listRecent(limit = 50): AuditEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM audit_log ORDER BY id DESC LIMIT ?
    `).all(limit) as AuditRawRow[];
    return rows.map(parseRow);
  }

  getById(id: number): AuditEntry | null {
    const row = this.db.prepare(`SELECT * FROM audit_log WHERE id = ?`).get(id) as AuditRawRow | undefined;
    return row ? parseRow(row) : null;
  }
}
