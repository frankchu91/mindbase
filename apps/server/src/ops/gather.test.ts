import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { gatherProjectCore, gatherUnbuiltSources } from './gather';
import { completeJson } from './llm';
import type { ChatChunk, ChatMessage } from '@mindbase/core';

let root: string;

async function touch(rel: string, body: string, epochSec: number) {
  const abs = join(root, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf-8');
  await utimes(abs, epochSec, epochSec);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mb-gather-'));
});

describe('gatherProjectCore', () => {
  it('reads the three core files, empty string when missing', async () => {
    await touch('context.md', 'ctx', 1000);
    const core = await gatherProjectCore(root);
    expect(core.context).toBe('ctx');
    expect(core.readme).toBe('');
  });
});

describe('gatherUnbuiltSources', () => {
  it('returns only files newer than context.md, newest first', async () => {
    await touch('context.md', 'ctx', 2000);
    await touch('sources/contributors/u/old.md', 'old', 1000);
    await touch('sources/contributors/u/new.md', 'new', 3000);
    await touch('sources/research/newer.md', 'newer', 4000);
    const s = await gatherUnbuiltSources(root);
    expect(s.map((f) => f.path)).toEqual(['sources/research/newer.md', 'sources/contributors/u/new.md']);
  });

  it('includes everything when context.md is missing and skips sidecars', async () => {
    await touch('sources/research/a.md', 'a', 1000);
    await touch('sources/research/a.extracted.md', 'sidecar', 1000);
    const s = await gatherUnbuiltSources(root);
    expect(s.map((f) => f.path)).toEqual(['sources/research/a.md']);
  });
});

function fakeCtx(outputs: string[]): Parameters<typeof completeJson>[0] {
  let call = 0;
  return {
    config: { model: 'fake' },
    getAdapter: () => ({
      chat: (_req: { model: string; messages: ChatMessage[] }): AsyncIterable<ChatChunk> => {
        const text = outputs[Math.min(call++, outputs.length - 1)]!;
        return (async function* () {
          yield { kind: 'delta', text } as ChatChunk;
          yield { kind: 'done', usage: { input_tokens: 1, output_tokens: 1 } } as ChatChunk;
        })();
      },
    }),
  };
}

describe('completeJson', () => {
  const schema = z.object({ x: z.number() });

  it('parses clean JSON', async () => {
    expect(await completeJson(fakeCtx(['{"x": 1}']), { system: 's', user: 'u', schema })).toEqual({ x: 1 });
  });

  it('parses fenced JSON with prose around it', async () => {
    expect(await completeJson(fakeCtx(['Sure! ```json\n{"x": 2}\n``` hope that helps']), { system: 's', user: 'u', schema })).toEqual({ x: 2 });
  });

  it('retries once after invalid output, then succeeds', async () => {
    expect(await completeJson(fakeCtx(['not json at all', '{"x": 3}']), { system: 's', user: 'u', schema })).toEqual({ x: 3 });
  });

  it('throws OpLlmError with raw output after two failures', async () => {
    await expect(completeJson(fakeCtx(['nope', 'still nope']), { system: 's', user: 'u', schema })).rejects.toMatchObject({
      raw: 'still nope',
    });
  });
});
