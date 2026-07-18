import { describe, it, expect, vi } from 'vitest';
import { OllamaAdapter } from './ollama';
import type { ChatChunk } from '../types';

function ndjsonResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(encoder.encode(l + '\n'));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('OllamaAdapter', () => {
  it('streams NDJSON text deltas', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({ message: { role: 'assistant', content: 'Hello' }, done: false }),
        JSON.stringify({ message: { role: 'assistant', content: ' world' }, done: false }),
        JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 5, eval_count: 2 }),
      ]),
    );
    const adapter = new OllamaAdapter({
      apiKey: '',
      model: 'llama3.2',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const chunks: ChatChunk[] = [];
    for await (const c of adapter.chat({ model: 'llama3.2', messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(c);
    }
    const text = chunks.filter((c) => c.kind === 'delta').map((c) => (c as { text: string }).text).join('');
    expect(text).toBe('Hello world');
    const done = chunks.find((c) => c.kind === 'done') as { kind: 'done'; usage: { input_tokens: number; output_tokens: number } } | undefined;
    expect(done?.usage.input_tokens).toBe(5);
    expect(done?.usage.output_tokens).toBe(2);
  });

  it('uses baseUrl localhost:11434 by default', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      ndjsonResponse([JSON.stringify({ message: { content: '' }, done: true })]),
    );
    const adapter = new OllamaAdapter({
      apiKey: '',
      model: 'llama3.2',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    for await (const _ of adapter.chat({ model: 'llama3.2', messages: [] })) { /* drain */ }
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.any(Object),
    );
  });

  it('testConnection hits /api/tags', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));
    const adapter = new OllamaAdapter({
      apiKey: '',
      model: 'llama3.2',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const r = await adapter.testConnection();
    expect(r.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('emits tool_call chunks from message.tool_calls', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ function: { name: 'add', arguments: { a: 1, b: 2 } } }],
          },
          done: true,
          prompt_eval_count: 1,
          eval_count: 1,
        }),
      ]),
    );
    const adapter = new OllamaAdapter({
      apiKey: '',
      model: 'llama3.2',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const chunks: ChatChunk[] = [];
    for await (const c of adapter.chat({
      model: 'llama3.2',
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
