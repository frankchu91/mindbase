import { describe, it, expect, vi } from 'vitest';
import { AnthropicAdapter } from './anthropic';
import type { ChatChunk } from '../types';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('AnthropicAdapter', () => {
  it('streams text deltas', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"id":"m1","usage":{"input_tokens":3,"output_tokens":0}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    );
    const adapter = new AnthropicAdapter({
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-5',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const chunks: ChatChunk[] = [];
    for await (const c of adapter.chat({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(c);
    }

    const text = chunks.filter((c) => c.kind === 'delta').map((c) => (c as { text: string }).text).join('');
    expect(text).toBe('Hello there');
    const done = chunks.find((c) => c.kind === 'done') as { kind: 'done'; usage: { input_tokens: number; output_tokens: number } } | undefined;
    expect(done?.usage.input_tokens).toBe(3);
    expect(done?.usage.output_tokens).toBe(2);
  });

  it('sends the dangerous-direct-browser-access header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"id":"m1","usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    );
    const adapter = new AnthropicAdapter({
      apiKey: 'sk-ant',
      model: 'claude-sonnet-4-5',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    for await (const _ of adapter.chat({ model: 'claude-sonnet-4-5', messages: [] })) { /* drain */ }
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers['x-api-key']).toBe('sk-ant');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('passes ContentBlock[] document through as Anthropic document source', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"id":"m1","usage":{"input_tokens":5,"output_tokens":0}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Summary"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    );
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      model: 'claude-opus-4-7',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const chunks: ChatChunk[] = [];
    for await (const c of adapter.chat({
      model: 'claude-opus-4-7',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Summarize this PDF.' },
          { type: 'document', media_type: 'application/pdf', data: 'JVBERi0xLjQK' },
        ],
      }],
    })) {
      chunks.push(c);
    }

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: 'Summarize this PDF.' },
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQK' },
        },
      ],
    }]);
  });

  it('still accepts plain string content (backwards compat)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"id":"m1","usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    );
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      model: 'claude-opus-4-7',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const chunks: ChatChunk[] = [];
    for await (const c of adapter.chat({
      model: 'claude-opus-4-7',
      messages: [{ role: 'user', content: 'plain text' }],
    })) {
      chunks.push(c);
    }

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([{ role: 'user', content: 'plain text' }]);
  });

  it('sets supportsPDFs capability flag', () => {
    const adapter = new AnthropicAdapter({ apiKey: 'k', model: 'm' });
    expect(adapter.supportsPDFs).toBe(true);
  });

  it('assembles tool_use blocks from input_json_delta events', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"id":"m1","usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_1","name":"add","input":{}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"a\\":1"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":",\\"b\\":2}"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":3}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    );
    const adapter = new AnthropicAdapter({
      apiKey: 'sk-ant',
      model: 'claude-sonnet-4-5',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const chunks: ChatChunk[] = [];
    for await (const c of adapter.chat({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: '1+2?' }],
      tools: [{ name: 'add', description: '', parameters: { type: 'object' } }],
    })) {
      chunks.push(c);
    }
    const tool = chunks.find((c) => c.kind === 'tool_call');
    expect(tool).toBeDefined();
    if (tool?.kind === 'tool_call') {
      expect(tool.tool_call.name).toBe('add');
      expect(tool.tool_call.arguments).toEqual({ a: 1, b: 2 });
    }
  });
});
