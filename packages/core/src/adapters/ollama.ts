import type { ChatChunk, ChatRequest, ToolCall, ToolDefinition } from '../types';
import type { AdapterConfig, LLMAdapter } from './types';

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaStreamLine {
  message?: { role?: string; content?: string; tool_calls?: OllamaToolCall[] };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

function toOllamaTools(tools: ToolDefinition[] | undefined) {
  if (!tools) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export class OllamaAdapter implements LLMAdapter {
  readonly name = 'ollama' as const;
  readonly supportsTools = true;
  private fetchImpl: typeof fetch;
  private baseUrl: string;

  constructor(private config: AdapterConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch.bind(globalThis);
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
  }

  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          tools: toOllamaTools(request.tools),
          stream: true,
          options: { temperature: request.temperature, num_predict: request.max_tokens },
        }),
      });
    } catch (e) {
      yield { kind: 'error', error: (e as Error).message };
      return;
    }
    if (!response.ok) {
      const text = await response.text();
      yield { kind: 'error', error: `HTTP ${response.status}: ${text}` };
      return;
    }
    const reader = response.body?.getReader();
    if (!reader) {
      yield { kind: 'error', error: 'no response body' };
      return;
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let usage = { input_tokens: 0, output_tokens: 0 };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let parsed: OllamaStreamLine;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            continue;
          }
          const content = parsed.message?.content;
          if (content) {
            yield { kind: 'delta', text: content };
          }
          if (parsed.message?.tool_calls) {
            for (const tc of parsed.message.tool_calls) {
              const call: ToolCall = {
                id: `ollama-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: tc.function.name,
                arguments: tc.function.arguments,
              };
              yield { kind: 'tool_call', tool_call: call };
            }
          }
          if (parsed.done) {
            usage = {
              input_tokens: parsed.prompt_eval_count ?? 0,
              output_tokens: parsed.eval_count ?? 0,
            };
          }
        }
      }
    } catch (e) {
      yield { kind: 'error', error: (e as Error).message };
      return;
    } finally {
      try { reader.releaseLock(); } catch { /* ignore */ }
    }

    yield { kind: 'done', usage };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await this.fetchImpl(`${this.baseUrl}/api/tags`, { method: 'GET' });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };

      // Connectivity alone isn't a useful verdict — verify the configured
      // model is actually present and can produce a token. Without this,
      // onboarding reports ok before any model has been pulled.
      const model = this.config.model;
      if (!model) return { ok: true };
      const tags = (await r.json()) as { models?: Array<{ name: string }> };
      const present = (tags.models ?? []).some(
        (m) => m.name === model || m.name === `${model}:latest` || m.name.startsWith(`${model}:`),
      );
      if (!present) {
        return { ok: false, error: `Model '${model}' is not installed in Ollama yet.` };
      }
      const gen = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt: 'hi', stream: false, options: { num_predict: 1 } }),
      });
      if (!gen.ok) return { ok: false, error: `Model '${model}' failed to respond: HTTP ${gen.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
