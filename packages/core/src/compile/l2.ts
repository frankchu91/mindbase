import type { LLMAdapter } from '../adapters/types';
import type { ChatMessage, ChatRequest, MetaJson, ToolCall } from '../types';
import type { Store } from '../storage/store';
import { ToolExecutor, type ToolResult } from '../tools/executor';
import { readIndex } from './index_md';
import { buildL2Messages, type WikiOverview } from './l2_prompts';
import { buildGraph } from '../graph/builder';
import { getOrphans, getBrokenLinks, getCohesion } from '../graph/analysis';

export interface CompileL2Options {
  adapter: LLMAdapter;
  store: Store;
  model: string;
  max_tokens_per_call?: number;
}

export interface CompileL2Result {
  ok: boolean;
  error?: string;
  tool_results: Array<{ call: ToolCall; result: ToolResult }>;
  total_usage: { input_tokens: number; output_tokens: number };
}

async function buildOverview(store: Store): Promise<WikiOverview> {
  const indexContent = await readIndex(store);
  const concepts: WikiOverview['concepts'] = [];

  const entries = await store.listDir('wiki/notes');
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.meta.json')) continue;
    const slug = entry.name.replace(/\.meta\.json$/, '');
    try {
      const meta = await store.readJSON<MetaJson>(`wiki/notes/${entry.name}`);
      concepts.push({
        slug,
        title: meta.title,
        one_liner: meta.one_liner,
        edit_state: meta.edit_state,
        word_count: meta.word_count,
      });
    } catch { /* skip */ }
  }

  // Add graph-based structural issues
  const graph = await buildGraph(store);
  const structuralIssues = {
    orphans: getOrphans(graph),
    brokenLinks: getBrokenLinks(graph),
    fragmentedTags: getCohesion(graph).fragmented,
  };

  return { indexContent, concepts, structuralIssues };
}

interface ActionObj {
  action: string;
  [key: string]: unknown;
}

function parseActions(text: string): ActionObj[] {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1]?.trim() ?? cleaned;
  }
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON array found in LLM response: ${cleaned.slice(0, 200)}`);
  }
  const jsonStr = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) {
    throw new Error('LLM response is not a JSON array');
  }
  return parsed as ActionObj[];
}

function actionToToolCall(action: ActionObj, index: number): ToolCall {
  const { action: name, ...args } = action;
  return { id: `l2-${index}`, name: name ?? 'unknown', arguments: args };
}

export async function compileL2(opts: CompileL2Options): Promise<CompileL2Result> {
  const { adapter, store, model } = opts;
  const executor = new ToolExecutor(store);
  const overview = await buildOverview(store);
  const messages: ChatMessage[] = await buildL2Messages(overview, store);

  const toolResults: Array<{ call: ToolCall; result: ToolResult }> = [];
  const totalUsage = { input_tokens: 0, output_tokens: 0 };

  let fullText = '';
  let error: string | undefined;

  const request: ChatRequest = {
    model,
    messages,
    max_tokens: opts.max_tokens_per_call ?? 8192,
    temperature: 0.3,
  };

  for await (const chunk of adapter.chat(request)) {
    switch (chunk.kind) {
      case 'delta':
        fullText += chunk.text;
        break;
      case 'done':
        totalUsage.input_tokens += chunk.usage.input_tokens;
        totalUsage.output_tokens += chunk.usage.output_tokens;
        break;
      case 'error':
        error = chunk.error;
        break;
      case 'tool_call':
        break;
    }
  }

  if (error) {
    return { ok: false, error, tool_results: toolResults, total_usage: totalUsage };
  }

  if (!fullText.trim()) {
    return { ok: true, tool_results: [], total_usage: totalUsage };
  }

  let actions: ActionObj[];
  try {
    actions = parseActions(fullText);
  } catch (e) {
    return {
      ok: false,
      error: `Failed to parse LLM response: ${(e as Error).message}`,
      tool_results: [],
      total_usage: totalUsage,
    };
  }

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!action) continue;
    const call = actionToToolCall(action, i);
    const result = await executor.execute(call);
    toolResults.push({ call, result });
  }

  return { ok: true, tool_results: toolResults, total_usage: totalUsage };
}
