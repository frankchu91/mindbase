import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { ensureSchema } from '../graph/index/schema';
import { AuditLogWriter, type StartAuditOptions } from './audit';

describe('AuditLogWriter', () => {
  let db: Database.Database;
  let writer: AuditLogWriter;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureSchema(db);
    writer = new AuditLogWriter(db);
  });

  const baseStart: StartAuditOptions = {
    rawId: 'raw-1',
    trigger: 'ingest',
    model: 'gpt-4o-mini',
    promptVersion: 'compile/v1',
    contextSlugs: ['rag', 'llm'],
  };

  it('startAudit returns a numeric id and writes a pending row', () => {
    const id = writer.startAudit(baseStart);
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = db.prepare(`SELECT status, raw_id, context_slugs FROM audit_log WHERE id=?`).get(id) as { status: string; raw_id: string; context_slugs: string };
    expect(row.status).toBe('pending');
    expect(row.raw_id).toBe('raw-1');
    expect(JSON.parse(row.context_slugs)).toEqual(['rag', 'llm']);
  });

  it('completeAudit updates the row with actions and stats', () => {
    const id = writer.startAudit(baseStart);
    writer.completeAudit(id, {
      actions: [{ kind: 'skip', reason: 'already covered' }],
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 1234,
      status: 'success',
    });
    const row = db.prepare(`SELECT * FROM audit_log WHERE id=?`).get(id) as Record<string, unknown>;
    expect(row.status).toBe('success');
    expect(row.input_tokens).toBe(100);
    expect(row.output_tokens).toBe(50);
    expect(row.duration_ms).toBe(1234);
    expect(JSON.parse(row.actions as string)).toEqual([{ kind: 'skip', reason: 'already covered' }]);
    expect(row.completed_at).not.toBeNull();
  });

  it('completeAudit with error status captures the error', () => {
    const id = writer.startAudit(baseStart);
    writer.completeAudit(id, {
      actions: [],
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 100,
      status: 'error',
      error: 'LLM returned malformed JSON',
    });
    const row = db.prepare(`SELECT status, error FROM audit_log WHERE id=?`).get(id) as { status: string; error: string };
    expect(row.status).toBe('error');
    expect(row.error).toBe('LLM returned malformed JSON');
  });

  it('listRecent returns rows newest first', () => {
    const id1 = writer.startAudit({ ...baseStart, rawId: 'raw-1' });
    const id2 = writer.startAudit({ ...baseStart, rawId: 'raw-2' });
    const id3 = writer.startAudit({ ...baseStart, rawId: 'raw-3' });
    const recent = writer.listRecent(10);
    expect(recent).toHaveLength(3);
    expect(recent[0]?.id).toBe(id3);
    expect(recent[1]?.id).toBe(id2);
    expect(recent[2]?.id).toBe(id1);
  });

  it('listRecent respects the limit', () => {
    for (let i = 0; i < 5; i++) writer.startAudit(baseStart);
    expect(writer.listRecent(3)).toHaveLength(3);
  });

  it('getById returns parsed actions/context_slugs as arrays', () => {
    const id = writer.startAudit(baseStart);
    writer.completeAudit(id, {
      actions: [
        { kind: 'propose_edit', slug: 'rag', section_anchor: 'Variants', new_content: '...', reason: 'add multi-vector' },
      ],
      inputTokens: 1, outputTokens: 1, durationMs: 1, status: 'success',
    });
    const entry = writer.getById(id);
    expect(entry).not.toBeNull();
    expect(entry?.contextSlugs).toEqual(['rag', 'llm']);
    expect(entry?.actions[0]?.kind).toBe('propose_edit');
  });

  it('getById returns null for missing id', () => {
    expect(writer.getById(999)).toBeNull();
  });
});
