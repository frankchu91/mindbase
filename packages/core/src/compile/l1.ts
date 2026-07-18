import type { LLMAdapter } from '../adapters/types';
import type { ChatMessage, ChatRequest, RawDoc, ToolCall } from '../types';
import type { Store } from '../storage/store';
import { ToolExecutor, type ToolResult } from '../tools/executor';
import { L1_TOOLS } from '../tools/schema';
import { gatherCompileContext } from './context';
import { buildL1MessagesV2 } from './prompts';
import { loadSchemaSections } from '../wiki/schema-sections';
import type { WikiIndex } from '../graph/index/wiki-index';
import type { HybridResult } from '../search/hybrid';
import type { CompileAction } from './audit';
import { slugify } from '../notes/create-note';

export type CompileL1ProgressEvent =
  | { kind: 'started'; text: string }
  | { kind: 'searching'; text: string }
  | { kind: 'candidates_found'; candidates: Array<{ slug: string; title: string; similarity: number }> }
  | { kind: 'reading'; action: string; slug: string; iteration: number }
  | { kind: 'applied'; action: string; slug: string; ok: boolean; error?: string }
  | { kind: 'aborted'; iteration: number; reason: string }
  | { kind: 'done'; iteration: number }
  | {
      kind: 'complete';
      summary: string;
      navigateTo?: { slug: string; path: string };
      tokensUsed: { input: number; output: number };
      durationMs: number;
    };

export interface CompileL1Options {
  raw: RawDoc;
  adapter: LLMAdapter;
  store: Store;
  model: string;
  wikiIndex: WikiIndex;
  hybridSearch: (query: string, limit: number) => Promise<HybridResult[]>;
  max_tokens_per_call?: number;
  max_iterations?: number;
  tokenBudget?: number;
  promptVersion?: string;
  onProgress?: (event: CompileL1ProgressEvent) => void;
}

export interface CompileL1Result {
  ok: boolean;
  error?: string;
  aborted_reason?: 'max_iterations';
  tool_results: Array<{ call: ToolCall; result: ToolResult }>;
  total_usage: { input_tokens: number; output_tokens: number };
}

function summarizeTarget(call: ToolCall): string {
  const args = call.arguments as Record<string, unknown>;
  return (
    (args.slug as string) ??
    (args.concept_name as string) ??
    (args.note_name as string) ??
    (args.name as string) ??
    (args.from as string) ??
    '?'
  );
}

/** Pick a navigation target from tool results — prefer create_concept, then append_to_concept, then propose_edit. */
function pickNavigateTarget(
  results: Array<{ call: ToolCall; result: ToolResult }>,
): { slug: string; path: string } | undefined {
  const priority = ['create_concept', 'append_to_concept', 'propose_edit'];
  for (const want of priority) {
    const hit = results.find((tr) => tr.call.name === want && tr.result.ok);
    if (!hit) continue;
    const args = hit.call.arguments as Record<string, unknown>;
    const rawName =
      (args.slug as string | undefined) ??
      (args.concept_name as string | undefined) ??
      (args.name as string | undefined);
    if (!rawName) continue;
    const slug = slugify(rawName);
    return { slug, path: `wiki/notes/${slug}.md` };
  }
  return undefined;
}

/** Translate a ToolCall + ToolResult into a structured CompileAction for audit. */
function toolCallToAction(call: ToolCall, _result: ToolResult): CompileAction {
  const args = call.arguments as Record<string, unknown>;
  switch (call.name) {
    case 'propose_edit':
      return {
        kind: 'propose_edit',
        slug: args.slug as string,
        section_anchor: args.section_anchor as string,
        new_content: ((args.new_content as string) ?? '').slice(0, 1000),
        reason: (args.reason as string) ?? '',
      };
    case 'create_concept':
      return {
        kind: 'create_concept',
        slug: ((args.name as string) ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        name: (args.name as string) ?? '',
        one_liner: (args.one_liner as string) ?? '',
        initial_content: ((args.initial_content as string) ?? '').slice(0, 1000),
        reason: '(create)',
      };
    case 'append_to_concept':
      return {
        kind: 'append_to_concept',
        concept_name: (args.concept_name as string) ?? '',
        section: (args.section as string) ?? '',
        content: ((args.content as string) ?? '').slice(0, 1000),
        reason: '(append)',
      };
    case 'link':
      return {
        kind: 'link',
        from: (args.from as string) ?? '',
        to: (args.to as string) ?? '',
        type: (args.type as string) ?? '',
        reason: (args.reason as string) ?? '',
      };
    case 'flag_contradiction':
      return {
        kind: 'flag_contradiction',
        slug_a: (args.slug_a as string) ?? '',
        slug_b: (args.slug_b as string) ?? '',
        reason: (args.reason as string) ?? '',
      };
    case 'merge':
      return {
        kind: 'merge',
        keep: (args.keep as string) ?? '',
        absorb: (args.absorb as string) ?? '',
        reason: (args.reason as string) ?? '',
        status: 'queued_for_review',
      };
    case 'skip':
      return { kind: 'skip', reason: (args.reason as string) ?? '' };
    default:
      return { kind: 'skip', reason: `unknown tool: ${call.name}` };
  }
}

/**
 * Consume a streaming chat response and return tool_calls, text content, and usage.
 * Bridges the AsyncIterable<ChatChunk> adapter interface to the non-streaming
 * shape expected by the compile orchestrator loop.
 */
export async function collectResponse(stream: AsyncIterable<import('../types').ChatChunk>): Promise<{
  tool_calls: ToolCall[];
  content: string;
  usage: { input_tokens: number; output_tokens: number };
  error?: string;
}> {
  const tool_calls: ToolCall[] = [];
  let content = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  let error: string | undefined;

  for await (const chunk of stream) {
    switch (chunk.kind) {
      case 'delta':
        content += chunk.text;
        break;
      case 'tool_call':
        tool_calls.push(chunk.tool_call);
        break;
      case 'done':
        usage = { input_tokens: chunk.usage.input_tokens, output_tokens: chunk.usage.output_tokens };
        break;
      case 'error':
        error = chunk.error;
        break;
    }
  }

  return { tool_calls, content, usage, error };
}

export async function compileL1(opts: CompileL1Options): Promise<CompileL1Result> {
  const startTime = Date.now();
  const promptVersion = opts.promptVersion ?? 'compile/v2';
  const tokenBudget = opts.tokenBudget ?? 16_000;
  const maxIter = opts.max_iterations ?? parseInt(process.env['MINDBASE_INGEST_MAX_ITER'] ?? '10', 10);

  opts.onProgress?.({ kind: 'started', text: `Compiling "${opts.raw.title}"` });
  opts.onProgress?.({ kind: 'searching', text: 'Searching your wiki for related concepts…' });

  // Derive the source slug to exclude from candidates + self-edits. For note compiles
  // the raw.id has the form 'note:<slug>'; raw imports use a short random id with no
  // exclusion. Used both by gatherCompileContext (recall filter) and ToolExecutor
  // (write-time guard) — belt and suspenders.
  const sourceSlugToExclude = opts.raw.id.startsWith('note:')
    ? opts.raw.id.slice('note:'.length)
    : undefined;

  // Step 1: gather graph-routed context
  const context = await gatherCompileContext(opts.raw, {
    store: opts.store,
    wikiIndex: opts.wikiIndex,
    hybridSearch: opts.hybridSearch,
    tokenBudget,
    ...(sourceSlugToExclude ? { sourceSlugToExclude } : {}),
  });

  opts.onProgress?.({
    kind: 'candidates_found',
    candidates: context.pages.map((p) => ({
      slug: p.slug,
      title: p.title,
      similarity: p.similarity,
    })),
  });

  // Step 2: start audit
  const audit = opts.wikiIndex.auditLog();
  const auditId = audit.startAudit({
    rawId: opts.raw.id,
    trigger: 'ingest',
    model: opts.model,
    promptVersion,
    contextSlugs: context.pages.map((p) => p.slug),
  });

  // Step 3: build messages + tool executor
  const schemaSections = await loadSchemaSections(opts.store).catch(() => ({}));
  const messages: ChatMessage[] = buildL1MessagesV2({ context, schemaSections });
  const executor = new ToolExecutor(opts.store, {
    wikiIndex: opts.wikiIndex,
    // Karpathy spec: "A single source might touch 10-15 wiki pages."
    // For substantive sources we want the agent to create pages for each
    // distinct entity / concept / claim it extracts. Set 20 to give headroom
    // above the typical 10-15 target (was 3 — way too low — then 10).
    createConceptLimit: 20,
    ...(sourceSlugToExclude ? { sourceSlugToExclude } : {}),
  });
  const toolResults: Array<{ call: ToolCall; result: ToolResult }> = [];
  const actions: CompileAction[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let lastError: string | undefined;
  let aborted: 'max_iterations' | undefined;
  let status: 'success' | 'partial' | 'error' = 'success';

  // Step 4: multi-turn tool-use loop
  try {
    for (let iter = 0; iter < maxIter; iter++) {
      const req: ChatRequest = {
        model: opts.model,
        messages,
        tools: L1_TOOLS,
        ...(opts.max_tokens_per_call !== undefined ? { max_tokens: opts.max_tokens_per_call } : {}),
      };

      const resp = await collectResponse(opts.adapter.chat(req));

      if (resp.error) {
        lastError = resp.error;
        status = 'error';
        break;
      }

      totalInput += resp.usage.input_tokens;
      totalOutput += resp.usage.output_tokens;

      const calls = resp.tool_calls;
      if (calls.length === 0) {
        // No more tool calls → LLM has finished.
        opts.onProgress?.({ kind: 'done', iteration: iter });
        break;
      }

      // Push assistant turn into message history with proper tool_calls field.
      // This is required by the OpenAI API — tool role messages must follow an
      // assistant message that has tool_calls.
      messages.push({
        role: 'assistant',
        content: resp.content ?? '',
        tool_calls: calls,
      });

      // Step 5: dispatch tool calls
      for (const call of calls) {
        opts.onProgress?.({ kind: 'reading', action: call.name, slug: summarizeTarget(call), iteration: iter });
        const result = await executor.execute(call);
        toolResults.push({ call, result });
        actions.push(toolCallToAction(call, result));
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result.ok ? (result.result ?? result.data ?? {}) : { error: result.error }),
        });
        opts.onProgress?.({
          kind: 'applied',
          action: call.name,
          slug: summarizeTarget(call),
          ok: result.ok,
          ...(result.error ? { error: result.error } : {}),
        });
      }

      // Check if we've hit the iteration cap *after* processing this turn's calls.
      if (iter === maxIter - 1) {
        aborted = 'max_iterations';
        opts.onProgress?.({ kind: 'aborted', iteration: iter, reason: 'max_iterations' });
      }
    }
  } catch (err) {
    status = 'error';
    lastError = (err as Error).message;
  }

  if (aborted) status = 'partial';

  // Step 6: complete audit entry
  audit.completeAudit(auditId, {
    actions,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    durationMs: Date.now() - startTime,
    status,
    error: lastError,
  });

  // Step 7: emit 'complete' as the final event
  const navigateTo = pickNavigateTarget(toolResults);
  const summary = (() => {
    if (lastError) return `Compile failed: ${lastError}`;
    const meaningful = toolResults.filter(
      (tr) => tr.result.ok && tr.call.name !== 'read_concept' && tr.call.name !== 'skip',
    );
    if (meaningful.length === 0) return 'No wiki changes';
    return meaningful
      .map((tr) => `${tr.call.name} → ${summarizeTarget(tr.call)}`)
      .slice(0, 3)
      .join('; ');
  })();
  opts.onProgress?.({
    kind: 'complete',
    summary,
    ...(navigateTo ? { navigateTo } : {}),
    tokensUsed: { input: totalInput, output: totalOutput },
    durationMs: Date.now() - startTime,
  });

  return {
    ok: lastError === undefined,
    ...(lastError ? { error: lastError } : {}),
    ...(aborted ? { aborted_reason: aborted } : {}),
    tool_results: toolResults,
    total_usage: { input_tokens: totalInput, output_tokens: totalOutput },
  };
}

// ─── Plan / Approve / Execute split (F1 — conversational ingest) ─────
//
// compileL1Plan runs the full multi-turn LLM loop with dryRun=true. The
// executor synthesizes success for every destructive call, so the LLM
// continues reasoning realistically without writing files. We collect
// the tool calls + (simulated) results as the "plan".
//
// compileL1Execute takes the plan plus the user's per-action approval
// map and runs the real executor on the approved subset. No new LLM call
// is needed because the actions are already chosen.

export interface ProposedAction {
  /** Stable id so the web UI can reference an action across plan→execute. */
  id: string;
  /** The original ToolCall the LLM emitted during the plan pass. */
  call: ToolCall;
  /** Simulated result from the dry-run executor — for UI preview. */
  simulatedResult: ToolResult;
}

export interface CompileL1Plan {
  raw_id: string;
  /**
   * Human-readable narrative the LLM produced while reading the source.
   * Concatenation of assistant `content` chunks from every iteration —
   * conversational ingest UI surfaces this as a streaming "takeaways" panel
   * BEFORE the user is asked to approve the structured `proposed` actions.
   */
  takeaways: string;
  proposed: ProposedAction[];
  total_usage: { input_tokens: number; output_tokens: number };
  error?: string;
}

export interface ApprovalMap {
  /** ProposedAction.id → approved boolean. Missing/undefined treated as approved. */
  [actionId: string]: boolean;
}

/**
 * Run compile in PLAN mode — gather the LLM's intended actions without
 * committing to disk. Returns a CompileL1Plan the UI can render for
 * user approval.
 */
export async function compileL1Plan(opts: CompileL1Options): Promise<CompileL1Plan> {
  const tokenBudget = opts.tokenBudget ?? 16_000;
  const maxIter = opts.max_iterations ?? parseInt(process.env['MINDBASE_INGEST_MAX_ITER'] ?? '10', 10);

  const sourceSlugToExclude = opts.raw.id.startsWith('note:')
    ? opts.raw.id.slice('note:'.length)
    : undefined;

  const context = await gatherCompileContext(opts.raw, {
    store: opts.store,
    wikiIndex: opts.wikiIndex,
    hybridSearch: opts.hybridSearch,
    tokenBudget,
    ...(sourceSlugToExclude ? { sourceSlugToExclude } : {}),
  });

  const schemaSections = await loadSchemaSections(opts.store).catch(() => ({}));
  const messages: ChatMessage[] = buildL1MessagesV2({ context, schemaSections });
  const executor = new ToolExecutor(opts.store, {
    wikiIndex: opts.wikiIndex,
    createConceptLimit: 20,
    dryRun: true,
    ...(sourceSlugToExclude ? { sourceSlugToExclude } : {}),
  });
  // Bind raw so create_concept's raw_id fallback works during planning too.
  executor.setRaw(opts.raw);

  const proposed: ProposedAction[] = [];
  const takeawaysChunks: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let lastError: string | undefined;

  try {
    for (let iter = 0; iter < maxIter; iter++) {
      const req: ChatRequest = {
        model: opts.model,
        messages,
        tools: L1_TOOLS,
        ...(opts.max_tokens_per_call !== undefined ? { max_tokens: opts.max_tokens_per_call } : {}),
      };
      const resp = await collectResponse(opts.adapter.chat(req));
      if (resp.error) { lastError = resp.error; break; }
      totalInput += resp.usage.input_tokens;
      totalOutput += resp.usage.output_tokens;
      const calls = resp.tool_calls;
      // Capture the LLM's narrative (assistant content) so the UI can stream
      // it as "takeaways" — the conversational layer above the actions.
      if (resp.content) takeawaysChunks.push(resp.content);
      if (calls.length === 0) break;

      messages.push({ role: 'assistant', content: resp.content ?? '', tool_calls: calls });
      for (const call of calls) {
        const result = await executor.execute(call);
        proposed.push({ id: `${call.id}`, call, simulatedResult: result });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result.ok ? (result.result ?? result.data ?? {}) : { error: result.error }),
        });
      }
    }
  } catch (e) {
    lastError = (e as Error).message;
  }

  return {
    raw_id: opts.raw.id,
    takeaways: takeawaysChunks.join('\n\n').trim(),
    proposed,
    total_usage: { input_tokens: totalInput, output_tokens: totalOutput },
    ...(lastError ? { error: lastError } : {}),
  };
}

/**
 * Execute an approved subset of a prior plan. Skips actions the user
 * rejected. Uses the REAL executor (dryRun=false). No new LLM call.
 *
 * Yields per-action results as an async generator so callers can stream
 * progress to the UI.
 */
export async function* compileL1Execute(
  opts: Omit<CompileL1Options, 'adapter' | 'model' | 'hybridSearch'>,
  plan: CompileL1Plan,
  approvals: ApprovalMap,
): AsyncGenerator<{ action: ProposedAction; result: ToolResult }> {
  const sourceSlugToExclude = opts.raw.id.startsWith('note:')
    ? opts.raw.id.slice('note:'.length)
    : undefined;

  const executor = new ToolExecutor(opts.store, {
    wikiIndex: opts.wikiIndex,
    createConceptLimit: 20,
    ...(sourceSlugToExclude ? { sourceSlugToExclude } : {}),
  });
  executor.setRaw(opts.raw);

  for (const action of plan.proposed) {
    const approved = approvals[action.id] !== false;
    if (!approved) {
      yield { action, result: { ok: true, data: { skipped: 'user-rejected' } } };
      continue;
    }
    const result = await executor.execute(action.call);
    yield { action, result };
  }
}
