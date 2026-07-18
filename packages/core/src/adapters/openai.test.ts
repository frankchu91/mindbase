import { describe, it, expect, vi } from 'vitest';
import { OpenAIAdapter } from './openai';
import type { ChatChunk } from '../types';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('OpenAIAdapter', () => {
  it('streams text deltas from SSE', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    const adapter = new OpenAIAdapter({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const chunks: ChatChunk[] = [];
    for await (const c of adapter.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(c);
    }

    const deltas = chunks.filter((c) => c.kind === 'delta').map((c) => (c as { text: string }).text);
    expect(deltas.join('')).toBe('Hello world');
    const done = chunks.find((c) => c.kind === 'done') as { kind: 'done'; usage: { input_tokens: number; output_tokens: number } } | undefined;
    expect(done).toBeDefined();
    expect(done?.usage.input_tokens).toBe(5);
    expect(done?.usage.output_tokens).toBe(2);
  });

  it('reassembles a data line split across reader chunks', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseResponse([
        // The SSE line `data: {"choices":[{"delta":{"content":"Hi"}}]}` is split here:
        'data: {"choices":[{"delta":',
        '{"content":"Hi"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    const adapter = new OpenAIAdapter({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const chunks: ChatChunk[] = [];
    for await (const c of adapter.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(c);
    }
    const text = chunks.filter((c) => c.kind === 'delta').map((c) => (c as { text: string }).text).join('');
    expect(text).toBe('Hi');
  });

  it('yields tool_call chunks when present', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"add","arguments":"{\\"a\\":1"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":",\\"b\\":2}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    const adapter = new OpenAIAdapter({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const chunks: ChatChunk[] = [];
    for await (const c of adapter.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'what is 1+2' }],
      tools: [
        {
          name: 'add',
          description: 'add two numbers',
          parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
        },
      ],
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

  it('yields error chunk on non-200 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }),
    );
    const adapter = new OpenAIAdapter({
      apiKey: 'sk-bad',
      model: 'gpt-4o-mini',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const chunks: ChatChunk[] = [];
    for await (const c of adapter.chat({ model: 'gpt-4o-mini', messages: [] })) {
      chunks.push(c);
    }
    expect(chunks[0]?.kind).toBe('error');
  });

  it('testConnection hits /v1/models and returns ok on 200', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const adapter = new OpenAIAdapter({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const r = await adapter.testConnection();
    expect(r.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/models'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('estimateTokens is a rough length/4 heuristic', () => {
    const adapter = new OpenAIAdapter({ apiKey: 'x', model: 'gpt-4o-mini' });
    expect(adapter.estimateTokens('abcd'.repeat(10))).toBeGreaterThan(0);
  });

  it('routes ContentBlock[] with document to Responses API', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      body: new ReadableStream({
        start(c) {
          const enc = new TextEncoder();
          c.enqueue(enc.encode('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hi"}\n\n'));
          c.enqueue(enc.encode('event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":2}}}\n\n'));
          c.close();
        },
      }),
    } as unknown as Response));

    const adapter = new OpenAIAdapter({
      apiKey: 'x',
      model: 'gpt-4o',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const chunks: unknown[] = [];
    for await (const c of adapter.chat({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Read this' },
          { type: 'document', media_type: 'application/pdf', data: 'JVBERi0xLjQK' },
        ],
      }],
    })) {
      chunks.push(c);
    }

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/v1/responses');
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(body.input[0].content).toEqual([
      { type: 'input_text', text: 'Read this' },
      { type: 'input_file', filename: 'document.pdf', file_data: expect.stringContaining('data:application/pdf;base64,JVBERi0xLjQK') },
    ]);
    expect(chunks.some((c) => (c as { kind: string; text?: string }).kind === 'delta' && (c as { text: string }).text === 'hi')).toBe(true);
    const done = chunks.find((c) => (c as { kind: string }).kind === 'done') as { kind: 'done'; usage: { input_tokens: number; output_tokens: number } } | undefined;
    expect(done?.usage.input_tokens).toBe(10);
    expect(done?.usage.output_tokens).toBe(2);
  });

  it('routes string content to chat/completions (no regression)', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      body: new ReadableStream({
        start(c) {
          const enc = new TextEncoder();
          c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
          c.enqueue(enc.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":1}}\n\n'));
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          c.close();
        },
      }),
    } as unknown as Response));

    const adapter = new OpenAIAdapter({ apiKey: 'x', model: 'gpt-4o', fetchImpl: fetchMock as unknown as typeof fetch });
    const chunks: unknown[] = [];
    for await (const c of adapter.chat({ model: 'gpt-4o', messages: [{ role: 'user', content: 'plain' }] })) {
      chunks.push(c);
    }

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/v1/chat/completions');
    expect(chunks.some((c) => (c as { kind: string; text?: string }).kind === 'delta' && (c as { text: string }).text === 'hi')).toBe(true);
  });
});
