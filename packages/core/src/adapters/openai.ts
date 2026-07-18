import type { ChatChunk, ChatMessage, ChatRequest, ContentBlock, ToolCall, ToolDefinition } from '../types';
import type { AdapterConfig, LLMAdapter } from './types';

interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: OpenAIToolCallDelta[];
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function toOpenAITools(tools: ToolDefinition[] | undefined) {
  if (!tools) return undefined;
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

function toResponsesTools(tools: ToolDefinition[] | undefined) {
  if (!tools) return undefined;
  return tools.map((t) => ({
    type: 'function' as const,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/**
 * Convert ChatMessage.content to Responses API content blocks. The text
 * type depends on role: `assistant` messages use `output_text`, everything
 * else (user / system / developer) uses `input_text`. Documents and images
 * are only valid in input roles; assistants can't emit them.
 */
function toResponsesContent(role: ChatMessage['role'], content: string | ContentBlock[]): unknown[] {
  const textType = role === 'assistant' ? 'output_text' : 'input_text';
  if (typeof content === 'string') return [{ type: textType, text: content }];
  return content.map((b) => {
    if (b.type === 'text') return { type: textType, text: b.text };
    if (b.type === 'document') {
      return {
        type: 'input_file',
        filename: 'document.pdf',
        file_data: `data:${b.media_type};base64,${b.data}`,
      };
    }
    if (b.type === 'image') {
      return {
        type: 'input_image',
        image_url: `data:${b.media_type};base64,${b.data}`,
      };
    }
    return b;
  });
}

interface SSEEvent {
  event?: string;
  data: string;
  endIndex: number;
}

function parseSSEEvents(buf: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const lines = buf.split('\n');
  let currentData = '';
  let currentEvent: string | undefined;
  let consumedChars = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('data: ')) {
      currentData += (currentData ? '\n' : '') + line.slice(6);
    } else if (line.startsWith('event: ')) {
      currentEvent = line.slice(7);
    } else if (line === '') {
      if (currentData) {
        // consumedChars = length of all lines up to and including this blank line
        const consumed = lines.slice(0, i + 1).join('\n').length + 1; // +1 for trailing newline
        events.push({ event: currentEvent, data: currentData, endIndex: consumed });
        consumedChars = consumed;
        currentData = '';
        currentEvent = undefined;
      }
    }
  }

  // If no events were parsed yet, consumedChars stays 0 — caller keeps the full buffer.
  // If some events were parsed, tag the last one with the consumed count (already set above).
  void consumedChars; // used via events[last].endIndex
  return events;
}

export class OpenAIAdapter implements LLMAdapter {
  readonly name = 'openai' as const;
  readonly supportsTools = true;
  readonly supportsPDFs = true;
  private fetchImpl: typeof fetch;
  private baseUrl: string;

  constructor(private config: AdapterConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch.bind(globalThis);
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');
  }

  /** Build the chat completions URL, handling various baseUrl formats:
   *  - "https://api.openai.com" → appends /v1/chat/completions
   *  - "http://localhost:3456/v1" → appends /chat/completions
   *  - "http://localhost:3456/v1/chat/completions" → uses as-is
   */
  private chatUrl(): string {
    if (this.baseUrl.includes('/chat/completions')) return this.baseUrl;
    if (/\/v\d+$/.test(this.baseUrl)) return `${this.baseUrl}/chat/completions`;
    return `${this.baseUrl}/v1/chat/completions`;
  }

  /** Build the Responses API URL */
  private responsesUrl(): string {
    // Strip any trailing path suffixes like /v1/chat/completions → back to base
    const stripped = this.baseUrl.replace(/\/chat\/completions$/, '');
    if (/\/v\d+$/.test(stripped)) return `${stripped}/responses`;
    return `${stripped}/v1/responses`;
  }

  /** Extract the base for non-chat endpoints (e.g. /models) */
  private modelsUrl(): string {
    // If user gave full chat path, strip it back to find /v1
    const stripped = this.baseUrl.replace(/\/chat\/completions$/, '');
    if (/\/v\d+$/.test(stripped)) return `${stripped}/models`;
    return `${stripped}/v1/models`;
  }

  private hasDocumentBlock(messages: ChatMessage[]): boolean {
    return messages.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'document'),
    );
  }

  /**
   * Flatten a content value for the chat/completions path.
   * ContentBlock[] without document blocks is reduced to a plain string.
   * (chat/completions does support text+image multimodal, but for minimal
   * blast-radius we flatten all text blocks into a single string.)
   */
  private flattenForCompletions(content: string | ContentBlock[]): string {
    if (typeof content === 'string') return content;
    return content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }

  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    if (this.hasDocumentBlock(request.messages)) {
      yield* this.chatViaResponses(request);
    } else {
      yield* this.chatViaCompletions(request);
    }
  }

  private async *chatViaCompletions(request: ChatRequest): AsyncIterable<ChatChunk> {
    // Flatten any ContentBlock[] messages to plain strings for chat/completions.
    // Also serialize tool_calls on assistant messages into the wire format
    // that OpenAI expects (array of {type, id, function: {name, arguments}}).
    const messages = request.messages.map((m) => {
      const base: Record<string, unknown> = {
        role: m.role,
        content: this.flattenForCompletions(m.content),
      };
      if (m.tool_call_id !== undefined) base['tool_call_id'] = m.tool_call_id;
      if (m.name !== undefined) base['name'] = m.name;
      if (m.tool_calls && m.tool_calls.length > 0) {
        base['tool_calls'] = m.tool_calls.map((tc) => ({
          type: 'function' as const,
          id: tc.id,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }));
      }
      return base;
    });

    let response: Response;
    try {
      response = await this.fetchImpl(this.chatUrl(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages,
          tools: toOpenAITools(request.tools),
          stream: true,
          stream_options: { include_usage: true },
          temperature: request.temperature,
          // GPT-5 / o-series reject `max_tokens` and require `max_completion_tokens`.
          // Older models (gpt-4o, gpt-4, etc.) accept either, so prefer the newer name.
          max_completion_tokens: request.max_tokens,
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
    const toolCallBuffers: Record<number, { id: string; name: string; args: string }> = {};
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
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          let parsed: OpenAIStreamChunk;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          const choice = parsed.choices?.[0];
          const delta = choice?.delta;
          if (delta?.content) {
            yield { kind: 'delta', text: delta.content };
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const buf = toolCallBuffers[tc.index] ?? { id: '', name: '', args: '' };
              if (tc.id) buf.id = tc.id;
              if (tc.function?.name) buf.name = tc.function.name;
              if (tc.function?.arguments) buf.args += tc.function.arguments;
              toolCallBuffers[tc.index] = buf;
            }
          }
          if (parsed.usage) {
            usage = {
              input_tokens: parsed.usage.prompt_tokens ?? 0,
              output_tokens: parsed.usage.completion_tokens ?? 0,
            };
          }
          if (choice?.finish_reason === 'tool_calls') {
            for (const buf of Object.values(toolCallBuffers)) {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(buf.args);
              } catch {
                args = { _raw: buf.args };
              }
              const toolCall: ToolCall = { id: buf.id, name: buf.name, arguments: args };
              yield { kind: 'tool_call', tool_call: toolCall };
            }
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

  private async *chatViaResponses(request: ChatRequest): AsyncIterable<ChatChunk> {
    // Build Responses-API input array (skip tool-result messages — complex in Responses API)
    const input = request.messages
      .filter((m) => m.role !== 'tool')
      .map((m) => ({
        role: m.role,
        content: toResponsesContent(m.role, m.content),
      }));

    let response: Response;
    try {
      response = await this.fetchImpl(this.responsesUrl(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          input,
          tools: toResponsesTools(request.tools),
          max_output_tokens: request.max_tokens ?? 4096,
          temperature: request.temperature,
          stream: true,
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
        const events = parseSSEEvents(buffer);
        if (events.length > 0) {
          const lastEvent = events[events.length - 1]!;
          buffer = buffer.slice(lastEvent.endIndex);
        }

        for (const ev of events) {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(ev.data) as Record<string, unknown>;
          } catch {
            continue;
          }

          const evType = parsed['type'] as string | undefined;

          if (evType === 'response.output_text.delta') {
            const text = parsed['delta'] as string | undefined;
            if (text) yield { kind: 'delta', text };
          } else if (evType === 'response.output_item.done') {
            // Emit tool_call when a complete function_call output item arrives
            const item = parsed['item'] as Record<string, unknown> | undefined;
            if (item?.['type'] === 'function_call') {
              const rawArgs = item['arguments'];
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {}));
              } catch {
                args = { _raw: rawArgs };
              }
              const toolCall: ToolCall = {
                id: (item['call_id'] ?? item['id'] ?? `resp-${Date.now()}`) as string,
                name: item['name'] as string,
                arguments: args,
              };
              yield { kind: 'tool_call', tool_call: toolCall };
            }
          } else if (evType === 'response.completed') {
            const resp = parsed['response'] as Record<string, unknown> | undefined;
            const u = resp?.['usage'] as Record<string, unknown> | undefined;
            if (u) {
              usage = {
                input_tokens: (u['input_tokens'] as number) ?? 0,
                output_tokens: (u['output_tokens'] as number) ?? 0,
              };
            }
          } else if (evType === 'response.error' || evType === 'response.failed') {
            const err = parsed['error'] as Record<string, unknown> | undefined;
            const msg = (err?.['message'] as string)
              ?? (err?.['code'] as string)
              ?? (parsed['response'] as Record<string, unknown> | undefined)?.['error']
              ?? `Responses API error (event: ${JSON.stringify(parsed).slice(0, 400)})`;
            console.warn('[openai-responses] error event:', JSON.stringify(parsed));
            yield { kind: 'error', error: typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 400) };
            return;
          }
          // response.created, response.in_progress, response.function_call_arguments.delta → ignored
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
    // Try /models first; if proxy doesn't support it, try a minimal chat request
    try {
      const r = await this.fetchImpl(this.modelsUrl(), {
        method: 'GET',
        headers: { authorization: `Bearer ${this.config.apiKey}` },
      });
      if (r.ok) return { ok: true };
    } catch { /* models endpoint may not exist on proxy */ }

    // Fallback: send a tiny non-streaming chat request
    try {
      const r = await this.fetchImpl(this.chatUrl(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'hi' }],
          max_completion_tokens: 1,
        }),
      });
      if (r.ok) return { ok: true };
      const text = await r.text();
      return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
