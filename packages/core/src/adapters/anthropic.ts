import type { ChatChunk, ChatMessage, ChatRequest, ContentBlock, ToolCall, ToolDefinition } from '../types';
import type { AdapterConfig, LLMAdapter } from './types';

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
  content_block?: { type: string; id?: string; name?: string; input?: unknown };
  message?: { id: string; usage?: { input_tokens: number; output_tokens: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
}

function toAnthropicContent(content: string | ContentBlock[]): string | Array<unknown> {
  if (typeof content === 'string') return content;
  return content.map((block) => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'document') {
      return {
        type: 'document',
        source: { type: 'base64', media_type: block.media_type, data: block.data },
      };
    }
    if (block.type === 'image') {
      return {
        type: 'image',
        source: { type: 'base64', media_type: block.media_type, data: block.data },
      };
    }
    return block; // pass through (should be unreachable given union)
  });
}

function splitSystem(messages: ChatMessage[]): {
  system: string | undefined;
  rest: Array<{ role: 'user' | 'assistant'; content: string | Array<unknown> }>;
} {
  const systemParts: string[] = [];
  const rest: Array<{ role: 'user' | 'assistant'; content: string | Array<unknown> }> = [];
  for (const m of messages) {
    if (m.role === 'system') {
      // System messages must be string in Anthropic — concatenate text blocks if multimodal
      if (typeof m.content === 'string') {
        systemParts.push(m.content);
      } else {
        const txt = m.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('\n');
        if (txt) systemParts.push(txt);
      }
    } else if (m.role === 'user' || m.role === 'assistant') {
      rest.push({ role: m.role, content: toAnthropicContent(m.content) });
    }
    // role === 'tool' is currently not handled by Anthropic; skip silently (matches old behavior)
  }
  return { system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined, rest };
}

function toAnthropicTools(tools: ToolDefinition[] | undefined) {
  if (!tools) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export class AnthropicAdapter implements LLMAdapter {
  readonly name = 'anthropic' as const;
  readonly supportsTools = true;
  readonly supportsPDFs = true;
  private fetchImpl: typeof fetch;
  private baseUrl: string;

  constructor(private config: AdapterConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch.bind(globalThis);
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
  }

  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    const { system, rest } = splitSystem(request.messages);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: request.model,
          system,
          messages: rest,
          tools: toAnthropicTools(request.tools),
          max_tokens: request.max_tokens ?? 4096,
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
    const toolBlocks: Record<number, { id: string; name: string; partial: string }> = {};

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const ev of events) {
          const lines = ev.split('\n');
          const dataLine = lines.find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          let parsed: AnthropicStreamEvent;
          try {
            parsed = JSON.parse(dataLine.slice(5).trim());
          } catch {
            continue;
          }
          switch (parsed.type) {
            case 'message_start': {
              const u = parsed.message?.usage;
              if (u) usage = { input_tokens: u.input_tokens, output_tokens: u.output_tokens };
              break;
            }
            case 'content_block_start': {
              const block = parsed.content_block;
              if (block?.type === 'tool_use' && typeof parsed.index === 'number') {
                toolBlocks[parsed.index] = {
                  id: block.id ?? '',
                  name: block.name ?? '',
                  partial: '',
                };
              }
              break;
            }
            case 'content_block_delta': {
              const d = parsed.delta;
              if (d?.type === 'text_delta' && d.text) {
                yield { kind: 'delta', text: d.text };
              }
              if (d?.type === 'input_json_delta' && typeof parsed.index === 'number') {
                const buf = toolBlocks[parsed.index];
                if (buf) buf.partial += d.partial_json ?? '';
              }
              break;
            }
            case 'content_block_stop': {
              if (typeof parsed.index === 'number') {
                const buf = toolBlocks[parsed.index];
                if (buf) {
                  let args: Record<string, unknown> = {};
                  try {
                    args = JSON.parse(buf.partial || '{}');
                  } catch {
                    args = { _raw: buf.partial };
                  }
                  const tc: ToolCall = { id: buf.id, name: buf.name, arguments: args };
                  yield { kind: 'tool_call', tool_call: tc };
                  delete toolBlocks[parsed.index];
                }
              }
              break;
            }
            case 'message_delta': {
              if (parsed.usage?.output_tokens !== undefined) {
                usage.output_tokens = parsed.usage.output_tokens;
              }
              break;
            }
            case 'message_stop': {
              // done handled after loop
              break;
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

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    // Anthropic has no cheap "list" endpoint; we send a minimal 1-token message.
    const chunks: ChatChunk[] = [];
    for await (const c of this.chat({
      model: this.config.model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
    })) {
      chunks.push(c);
      if (c.kind === 'error') return { ok: false, error: c.error };
      if (c.kind === 'done') return { ok: true };
    }
    return { ok: true };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
