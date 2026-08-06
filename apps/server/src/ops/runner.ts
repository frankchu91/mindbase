// apps/server/src/ops/runner.ts
//
// The single orchestration engine for server-side operations:
// gather → one constrained LLM completion → (checkpoint) → validate →
// apply via executors → append to logs/<date>.md → emit SSE events.
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { applyActions } from './executors';
import { completeJson, OpLlmError, type LlmCtx } from './llm';
import { gatherProjectCore, gatherUnbuiltSources } from './gather';
import { contributePrompt, contributePlanSchema, type RelatedPage } from './recipes/contribute';
import { buildPrompt, buildSchema } from './recipes/build';
import type { Action } from './types';

export type OpEvent =
  | { kind: 'phase'; phase: string }
  | { kind: 'plan'; planId: string; takeaways: string[]; plan: Action[] }
  | { kind: 'applied'; applied: string[]; failed: Array<{ action: string; error: string }> }
  | { kind: 'done' }
  | { kind: 'error'; error: string };

export interface OpsCtx extends LlmCtx {
  projectRoot: string;
  projectId: string;
  /** Hybrid search over the wiki; empty array on failure is acceptable. */
  findRelated?: (text: string, k: number) => Promise<RelatedPage[]>;
}

// --- pending contribute plans (checkpoint state) ---
interface PendingPlan { actions: Action[]; projectRoot: string; projectId: string; expiresAt: number }
const pendingPlans = new Map<string, PendingPlan>();
const PLAN_TTL_MS = 10 * 60 * 1000;

function prunePlans(): void {
  const now = Date.now();
  for (const [id, p] of pendingPlans) if (p.expiresAt < now) pendingPlans.delete(id);
}

// --- per-project build locks ---
const buildLocks = new Set<string>();

async function appendOpLog(root: string, op: string, summary: string): Promise<void> {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hhmm = now.toISOString().slice(11, 16);
  await mkdir(join(root, 'logs'), { recursive: true });
  await appendFile(join(root, 'logs', `${date}.md`), `## [${date} ${hhmm}] ${op} | ${summary}\n`, 'utf-8');
}

function errText(e: unknown): string {
  if (e instanceof OpLlmError) return `${e.message}\n\nModel output:\n${e.raw.slice(0, 800)}`;
  return (e as Error).message;
}

export async function runContributePlan(ctx: OpsCtx, text: string, emit: (e: OpEvent) => void): Promise<void> {
  try {
    emit({ kind: 'phase', phase: 'reading project' });
    const core = await gatherProjectCore(ctx.projectRoot);
    emit({ kind: 'phase', phase: 'finding related pages' });
    const related = (await ctx.findRelated?.(text, 5).catch(() => [])) ?? [];
    emit({ kind: 'phase', phase: `asking ${ctx.config.model}` });
    const { system, user } = contributePrompt({ text, core, related });
    const out = await completeJson(ctx, { system, user, schema: contributePlanSchema });

    prunePlans();
    const planId = randomUUID();
    pendingPlans.set(planId, {
      actions: out.plan,
      projectRoot: ctx.projectRoot,
      projectId: ctx.projectId,
      expiresAt: Date.now() + PLAN_TTL_MS,
    });
    emit({ kind: 'plan', planId, takeaways: out.takeaways, plan: out.plan });
    emit({ kind: 'done' });
  } catch (e) {
    emit({ kind: 'error', error: errText(e) });
  }
}

export async function applyContributePlan(planId: string, selected: number[], emit: (e: OpEvent) => void): Promise<void> {
  try {
    prunePlans();
    const pending = pendingPlans.get(planId);
    if (!pending) {
      emit({ kind: 'error', error: 'This plan expired (plans are held for 10 minutes). Run the contribute again.' });
      return;
    }
    pendingPlans.delete(planId);
    const actions = pending.actions.filter((_, i) => selected.includes(i));
    if (actions.length === 0) {
      emit({ kind: 'error', error: 'No actions selected.' });
      return;
    }
    emit({ kind: 'phase', phase: 'applying' });
    const result = await applyActions(pending.projectRoot, actions);
    await appendOpLog(pending.projectRoot, 'contribute', `applied ${result.applied.length}, failed ${result.failed.length} (ui)`);
    emit({ kind: 'applied', applied: result.applied, failed: result.failed });
    emit({ kind: 'done' });
  } catch (e) {
    emit({ kind: 'error', error: errText(e) });
  }
}

export async function runBuild(ctx: OpsCtx, emit: (e: OpEvent) => void): Promise<void> {
  if (buildLocks.has(ctx.projectId)) {
    emit({ kind: 'error', error: 'A build is already running for this project.' });
    return;
  }
  buildLocks.add(ctx.projectId);
  try {
    emit({ kind: 'phase', phase: 'gathering unbuilt sources' });
    const [core, sources] = await Promise.all([
      gatherProjectCore(ctx.projectRoot),
      gatherUnbuiltSources(ctx.projectRoot),
    ]);
    emit({ kind: 'phase', phase: `synthesizing with ${ctx.config.model} (${sources.length} sources)` });
    const { system, user } = buildPrompt({ core, sources, today: new Date().toISOString().slice(0, 10) });
    const out = await completeJson(ctx, { system, user, schema: buildSchema, maxTokens: 8192 });

    emit({ kind: 'phase', phase: 'writing' });
    const result = await applyActions(ctx.projectRoot, out.actions);
    await appendOpLog(ctx.projectRoot, 'build', `applied ${result.applied.length}, failed ${result.failed.length}, sources=${sources.length} (ui)`);
    emit({ kind: 'applied', applied: result.applied, failed: result.failed });
    emit({ kind: 'done' });
  } catch (e) {
    emit({ kind: 'error', error: errText(e) });
  } finally {
    buildLocks.delete(ctx.projectId);
  }
}
