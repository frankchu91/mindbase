import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootTestServer, type TestServer } from './helpers/server-fixture';

let srv: TestServer;
beforeAll(async () => {
  srv = await bootTestServer();
  const notesDir = join(srv.dataDir, 'wiki', 'notes');
  mkdirSync(notesDir, { recursive: true });
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 20 * 86400000).toISOString();
  writeFileSync(join(notesDir, 'new.md'), '# New\n\nrecent');
  writeFileSync(join(notesDir, 'new.meta.json'), JSON.stringify({
    id: 'new', type: 'concept', title: 'New', one_liner: '', word_count: 2,
    compile_version: 0, edit_state: 'human_touched', last_human_edit: now,
    created: now, updated: now, sources: [], related: [], kind: 'note',
  }));
  writeFileSync(join(notesDir, 'old.md'), '# Old\n\nold body');
  writeFileSync(join(notesDir, 'old.meta.json'), JSON.stringify({
    id: 'old', type: 'concept', title: 'Old', one_liner: '', word_count: 2,
    compile_version: 0, edit_state: 'human_touched', last_human_edit: old,
    created: old, updated: old, sources: [], related: [], kind: 'note',
  }));
});
afterAll(async () => { await srv.close(); });

describe('GET /api/pulse', () => {
  it('returns weekly_writes for recent notes', async () => {
    const res = await fetch(`${srv.url}/api/pulse`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { weekly_writes: Array<{ slug: string }>; stale_notes: Array<{ slug: string }> };
    expect(body.weekly_writes.map((w) => w.slug)).toContain('new');
  });

  it('returns stale_notes for >= 14d untouched', async () => {
    const res = await fetch(`${srv.url}/api/pulse`);
    const body = (await res.json()) as { stale_notes: Array<{ slug: string; days_since: number }> };
    const old = body.stale_notes.find((s) => s.slug === 'old');
    expect(old).toBeDefined();
    expect(old!.days_since).toBeGreaterThanOrEqual(14);
  });

  it('caches result for the day', async () => {
    await fetch(`${srv.url}/api/pulse`).then((r) => r.json());
    const fs = await import('node:fs');
    const today = new Date().toISOString().slice(0, 10);
    expect(fs.existsSync(join(srv.dataDir, 'pulse', `${today}.json`))).toBe(true);
  });

  it('?refresh=true bypasses cache', async () => {
    const a = await fetch(`${srv.url}/api/pulse`).then((r) => r.json()) as { generated_at: string };
    await new Promise((r) => setTimeout(r, 100));
    const b = await fetch(`${srv.url}/api/pulse?refresh=true`).then((r) => r.json()) as { generated_at: string };
    expect(b.generated_at).not.toBe(a.generated_at);
  });
});
