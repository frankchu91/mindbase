// apps/mcp/src/tools/ingest-execute.ts
//
// Second half of conversational ingest. Takes a planId from a prior
// `ingest_plan` call plus optional per-action approvals, runs the approved
// subset with the REAL executor (no LLM call), and returns per-action results.
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { compileL1Execute, crossLink, slugify } from '@mindbase/core';
import { planCache } from '../lib/plan-cache.js';

const inputSchema = z.object({
  planId: z.string().min(1),
  approvals: z.record(z.string(), z.boolean()).optional().default({}),
});

export const definition = {
  name: 'ingest_execute',
  description:
    'Conversational ingest, step 2 of 2. Commits the user-approved subset of a plan returned ' +
    'by ingest_plan. `approvals` is a map of action id → boolean; omitted ids default to ' +
    'approved (true). Returns the per-action results plus a summary of what got created / updated.',
  inputSchema: {
    type: 'object',
    properties: {
      planId: { type: 'string', description: 'Plan id returned by ingest_plan.' },
      approvals: {
        type: 'object',
        description: 'Map of action id → boolean. False rejects that action; omitted ids are approved.',
        additionalProperties: { type: 'boolean' },
      },
    },
    required: ['planId'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { planId, approvals } = parsed.data;

  const cached = planCache.get(planId);
  if (!cached) {
    return errorResult(
      `Plan ${planId} not found or expired. Call ingest_plan again.`,
      'Plans expire 30 minutes after generation.',
    );
  }

  try {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    for await (const { action, result } of compileL1Execute(
      {
        raw: cached.rawDoc,
        store: ctx.store,
        wikiIndex: ctx.wikiIndex,
      },
      cached.plan,
      approvals,
    )) {
      const ok = result.ok;
      const entry: { id: string; ok: boolean; error?: string } = ok
        ? { id: action.id, ok: true }
        : { id: action.id, ok: false, error: result.error ?? 'unknown' };
      results.push(entry);
      if (!ok) continue;
      if (action.call.name === 'create_concept') {
        const name = (action.call.arguments as { name?: string }).name;
        if (name) created.push(slugify(name));
      } else if (action.call.name === 'append_to_concept' || action.call.name === 'update_note') {
        const name = (action.call.arguments as { concept_name?: string; note_name?: string }).concept_name
          ?? (action.call.arguments as { note_name?: string }).note_name;
        if (name) updated.push(name);
      } else if (action.call.name === 'skip') {
        skipped.push(action.id);
      }
    }

    // Best-effort cross-link + reindex so subsequent queries see what just committed.
    let crossLinked = 0;
    try {
      const xlink = await crossLink(ctx.store, { mode: 'auto' });
      crossLinked = xlink.applied;
      await ctx.reindex();
    } catch { /* non-fatal */ }

    // Evict the now-consumed plan.
    planCache.delete(planId);

    return textResult({
      planId,
      results,
      summary: {
        actions_total: cached.plan.proposed.length,
        actions_run: results.length,
        actions_failed: results.filter((r) => !r.ok).length,
        pages_created: [...new Set(created)],
        pages_updated: [...new Set(updated)],
        actions_skipped: skipped,
        cross_links_added: crossLinked,
      },
    });
  } catch (e) {
    return errorResult(`ingest_execute failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
