import { describe, it, expect } from 'vitest';
import { parseExtractedCards, extractCards } from './extract';
import type { LLMAdapter } from '../adapters/types';
import type { ChatChunk } from '../types';

describe('parseExtractedCards', () => {
  it('parses a valid JSON array', () => {
    const json = JSON.stringify([
      { question: 'What is the bottleneck of RAG systems?', answer: 'Chunking strategy, not retrieval.' },
      { question: 'What does SM-2 stand for?', answer: 'SuperMemo 2, a spaced repetition algorithm.' },
    ]);
    const result = parseExtractedCards(json, 5);
    expect(result).toHaveLength(2);
    expect(result[0]!.question).toBe('What is the bottleneck of RAG systems?');
    expect(result[1]!.answer).toBe('SuperMemo 2, a spaced repetition algorithm.');
  });

  it('strips markdown code fences', () => {
    const text = '```json\n[{"question": "How does SM-2 work?", "answer": "Via ease factor and intervals."}]\n```';
    const result = parseExtractedCards(text, 5);
    expect(result).toHaveLength(1);
    expect(result[0]!.question).toBe('How does SM-2 work?');
  });

  it('strips plain code fences without language', () => {
    const text = '```\n[{"question": "What is X?", "answer": "It is Y."}]\n```';
    const result = parseExtractedCards(text, 5);
    expect(result).toHaveLength(1);
  });

  it('returns empty array on invalid JSON (no throw)', () => {
    const result = parseExtractedCards('this is not json', 5);
    expect(result).toEqual([]);
  });

  it('returns empty array when JSON is not an array', () => {
    const result = parseExtractedCards('{"question": "Q", "answer": "A"}', 5);
    expect(result).toEqual([]);
  });

  it('skips non-object items in the array', () => {
    const json = JSON.stringify([
      null,
      42,
      'string',
      { question: 'What is X?', answer: 'It is Y.' },
    ]);
    const result = parseExtractedCards(json, 5);
    expect(result).toHaveLength(1);
  });

  it('skips items with missing or wrong type question/answer', () => {
    const json = JSON.stringify([
      { question: 'Valid Q?', answer: 'Valid A.' },
      { question: 123, answer: 'A' },
      { answer: 'no question field' },
      { question: 'Q', answer: null },
    ]);
    const result = parseExtractedCards(json, 5);
    expect(result).toHaveLength(1);
  });

  it('skips cards with too-short question or answer', () => {
    const json = JSON.stringify([
      { question: 'Q?', answer: 'A' }, // question < 5 chars
      { question: 'What is X?', answer: 'A' }, // answer < 2 chars
      { question: 'What is X really?', answer: 'It is Y.' },
    ]);
    const result = parseExtractedCards(json, 5);
    expect(result).toHaveLength(1);
    expect(result[0]!.question).toBe('What is X really?');
  });

  it('respects max cap', () => {
    const json = JSON.stringify([
      { question: 'Question one?', answer: 'Answer one.' },
      { question: 'Question two?', answer: 'Answer two.' },
      { question: 'Question three?', answer: 'Answer three.' },
      { question: 'Question four?', answer: 'Answer four.' },
    ]);
    const result = parseExtractedCards(json, 2);
    expect(result).toHaveLength(2);
  });

  it('includes excerpt when present', () => {
    const json = JSON.stringify([
      { question: 'What is RAG?', answer: 'Retrieval Augmented Generation.', excerpt: 'RAG combines retrieval with generation.' },
    ]);
    const result = parseExtractedCards(json, 5);
    expect(result[0]!.excerpt).toBe('RAG combines retrieval with generation.');
  });

  it('excerpt is optional (undefined when not present)', () => {
    const json = JSON.stringify([
      { question: 'What is RAG?', answer: 'Retrieval Augmented Generation.' },
    ]);
    const result = parseExtractedCards(json, 5);
    expect(result[0]!.excerpt).toBeUndefined();
  });
});

describe('extractCards', () => {
  function makeMockAdapter(chunks: ChatChunk[]): LLMAdapter {
    return {
      name: 'openai' as const,
      supportsTools: false,
      estimateTokens: () => 0,
      testConnection: async () => ({ ok: true }),
      chat: async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      },
    };
  }

  it('parses cards from adapter delta stream', async () => {
    const responseJson = JSON.stringify([
      { question: 'How does SM-2 update interval?', answer: 'By multiplying by the ease factor.' },
    ]);

    const adapter = makeMockAdapter([
      { kind: 'delta', text: responseJson },
      { kind: 'done', usage: { input_tokens: 100, output_tokens: 50 } },
    ]);

    const result = await extractCards({
      adapter,
      model: 'gpt-4o-mini',
      page: { title: 'SM-2 Algorithm', one_liner: 'Spaced repetition algorithm', body: 'SM-2 is a spaced repetition algorithm that updates intervals based on ease factor.', slug: 'sm2-algorithm' },
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.question).toBe('How does SM-2 update interval?');
  });

  it('handles chunked delta delivery', async () => {
    const part1 = '[{"question": "What is SM-2?", ';
    const part2 = '"answer": "A spaced repetition algorithm."}]';

    const adapter = makeMockAdapter([
      { kind: 'delta', text: part1 },
      { kind: 'delta', text: part2 },
      { kind: 'done', usage: { input_tokens: 100, output_tokens: 30 } },
    ]);

    const result = await extractCards({
      adapter,
      model: 'gpt-4o-mini',
      page: { title: 'Test', one_liner: 'Test', body: 'Test body content for extraction test.', slug: 'test' },
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.answer).toBe('A spaced repetition algorithm.');
  });

  it('throws when adapter emits an error chunk', async () => {
    const adapter = makeMockAdapter([
      { kind: 'error', error: 'API rate limit exceeded' },
    ]);

    await expect(extractCards({
      adapter,
      model: 'gpt-4o-mini',
      page: { title: 'Test', one_liner: 'Test', body: 'Test body', slug: 'test' },
    })).rejects.toThrow('API rate limit exceeded');
  });

  it('returns empty array when LLM returns []', async () => {
    const adapter = makeMockAdapter([
      { kind: 'delta', text: '[]' },
      { kind: 'done', usage: { input_tokens: 100, output_tokens: 2 } },
    ]);

    const result = await extractCards({
      adapter,
      model: 'gpt-4o-mini',
      page: { title: 'Short', one_liner: 'Too short', body: 'Short.', slug: 'short' },
    });

    expect(result).toEqual([]);
  });
});
