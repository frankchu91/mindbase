// apps/server/src/ops/runner.ts
//
// The single orchestration engine for server-side operations:
// gather → one constrained LLM completion → (checkpoint) → validate →
// apply via executors → append to logs/<date>.md → emit SSE events.
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { applyActions } from './executors';
import { completeJson, OpLlmError, type LlmCtx } from './llm';
import { gatherProjectCore, gatherResearchPages, gatherUnbuiltSources } from './gather';
import { contributePrompt, contributePlanSchema, type RelatedPage } from './recipes/contribute';
import { buildPrompt, buildSchema } from './recipes/build';
import { lintPrompt, lintSchema, type Finding } from './recipes/lint';
import { researchPrompt, researchSchema, type ResearchSource } from './recipes/research';
import { braveSearchSources } from './web-search';
import type { Action } from './types';

export interface StoredFinding extends Finding {
  id: string;
  dismissed: boolean;
}

export type OpEvent =
  | { kind: 'phase'; phase: string }
  | { kind: 'plan'; planId: string; takeaways: string[]; plan: Action[] }
  | { kind: 'applied'; applied: string[]; failed: Array<{ action: string; error: string }>; note?: string }
  | { kind: 'findings'; date: string; findings: StoredFinding[] }
  | { kind: 'done' }
  | { kind: 'error'; error: string };

export interface OpsCtx extends LlmCtx {
  projectRoot: string;
  projectId: string;
  /** Hybrid search over the wiki; empty array on failure is acceptable. */
  findRelated?: (text: string, k: number) => Promise<RelatedPage[]>;
  /** Optional Brave Search key — enables web mode for the research op. */
  braveApiKey?: string;
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

// --- research: synthesize a new research page (wiki-only or wiki+web) ---

const WIKI_SOURCE_CHAR_CAP = 4_000;

export async function runResearch(ctx: OpsCtx, topic: string, emit: (e: OpEvent) => void): Promise<void> {
  try {
    emit({ kind: 'phase', phase: 'searching your wiki' });
    const core = await gatherProjectCore(ctx.projectRoot);
    const related = (await ctx.findRelated?.(topic, 6).catch(() => [])) ?? [];
    const sources: ResearchSource[] = (
      await Promise.all(
        related.map(async (r) => {
          const body = await readFile(join(ctx.projectRoot, r.path), 'utf-8').catch(() => '');
          return body.trim() ? [{ label: r.path, body: body.slice(0, WIKI_SOURCE_CHAR_CAP) }] : [];
        }),
      )
    ).flat();

    let mode: 'wiki-only' | 'web' = 'wiki-only';
    let degraded = '';
    if (ctx.braveApiKey) {
      emit({ kind: 'phase', phase: 'searching the web (Brave)' });
      try {
        sources.push(...(await braveSearchSources(ctx.braveApiKey, topic)));
        mode = 'web';
      } catch (e) {
        degraded = ` Web search failed (${(e as Error).message}); answered from your wiki only.`;
      }
    }

    emit({ kind: 'phase', phase: `synthesizing with ${ctx.config.model} (${sources.length} sources)` });
    const { system, user } = researchPrompt({ topic, core, sources, mode });
    const out = await completeJson(ctx, { system, user, schema: researchSchema, maxTokens: 8192 });

    emit({ kind: 'phase', phase: 'writing' });
    const result = await applyActions(ctx.projectRoot, out.actions);
    await appendOpLog(ctx.projectRoot, 'research', `"${topic.slice(0, 60)}" mode=${mode} applied ${result.applied.length} (ui)`);
    const note = mode === 'web'
      ? `Synthesized from your wiki + ${sources.length} sources including web results.${degraded}`
      : `Synthesized from your wiki only — add a Brave Search key in Settings for web research.${degraded}`;
    emit({ kind: 'applied', applied: result.applied, failed: result.failed, note });
    emit({ kind: 'done' });
  } catch (e) {
    emit({ kind: 'error', error: errText(e) });
  }
}

// --- lint: emits findings, never writes to the wiki ---

interface LintArtifact { date: string; findings: StoredFinding[] }

const lintDir = (root: string) => join(root, 'artifacts', 'lint');

/** Most recent artifacts/lint/<date>.json, or null when none exist. */
export async function latestLintArtifact(root: string): Promise<LintArtifact | null> {
  const files = (await readdir(lintDir(root)).catch(() => [] as string[]))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  const last = files[files.length - 1];
  if (!last) return null;
  try {
    return JSON.parse(await readFile(join(lintDir(root), last), 'utf-8')) as LintArtifact;
  } catch {
    return null;
  }
}

export async function dismissLintFinding(root: string, id: string): Promise<boolean> {
  const artifact = await latestLintArtifact(root);
  if (!artifact) return false;
  const hit = artifact.findings.find((f) => f.id === id);
  if (!hit) return false;
  hit.dismissed = true;
  await writeFile(join(lintDir(root), `${artifact.date}.json`), JSON.stringify(artifact, null, 2), 'utf-8');
  return true;
}

export async function runLint(ctx: OpsCtx, emit: (e: OpEvent) => void): Promise<void> {
  try {
    emit({ kind: 'phase', phase: 'reading project' });
    const [core, pages] = await Promise.all([
      gatherProjectCore(ctx.projectRoot),
      gatherResearchPages(ctx.projectRoot),
    ]);
    if (!core.context.trim() && pages.length === 0) {
      emit({ kind: 'error', error: 'Nothing to lint yet — contribute a thought or two first.' });
      return;
    }
    emit({ kind: 'phase', phase: `checking ${pages.length} pages with ${ctx.config.model}` });
    const { system, user } = lintPrompt({ core, pages });
    const out = await completeJson(ctx, { system, user, schema: lintSchema, maxTokens: 4096 });

    const date = new Date().toISOString().slice(0, 10);
    const findings: StoredFinding[] = out.findings.map((f) => ({
      ...f,
      // Models sometimes echo path labels with different casing/prefixes;
      // normalize so the UI's page links resolve.
      pages: f.pages.map((p) => (/^\.?\/?context\.md$/i.test(p.trim()) ? 'context.md' : p.trim())),
      id: randomUUID(),
      dismissed: false,
    }));
    await mkdir(lintDir(ctx.projectRoot), { recursive: true });
    await writeFile(join(lintDir(ctx.projectRoot), `${date}.json`), JSON.stringify({ date, findings }, null, 2), 'utf-8');
    await appendOpLog(ctx.projectRoot, 'lint', `${findings.length} findings, pages=${pages.length} (ui)`);
    emit({ kind: 'findings', date, findings });
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
