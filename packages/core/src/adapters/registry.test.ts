import { describe, it, expect } from 'vitest';
import { createAdapter } from './registry';

describe('createAdapter', () => {
  it('creates an OpenAI adapter', () => {
    const a = createAdapter('openai', { apiKey: 'x', model: 'gpt-4o-mini' });
    expect(a.name).toBe('openai');
  });

  it('creates an Anthropic adapter', () => {
    const a = createAdapter('anthropic', { apiKey: 'x', model: 'claude-sonnet-4-5' });
    expect(a.name).toBe('anthropic');
  });

  it('creates an Ollama adapter', () => {
    const a = createAdapter('ollama', { apiKey: '', model: 'llama3.2' });
    expect(a.name).toBe('ollama');
  });

  it('throws for unknown provider', () => {
    expect(() => createAdapter('unknown' as never, { apiKey: 'x', model: 'x' })).toThrow();
  });

  it('throws for atlas (stub in v1.0)', () => {
    expect(() => createAdapter('atlas', { apiKey: 'x', model: 'x' })).toThrow(/not yet/i);
  });
});
