// apps/server/src/ops/llm.ts
//
// One constrained JSON completion per call — the ops engine never runs
// multi-step tool loops (unreliable on local models). Tolerates ```json
// fences; retries once with the parse error appended.
import type { z } from 'zod';
import type { ChatChunk, ChatMessage } from '@mindbase/core';

export interface LlmCtx {
  getAdapter: () => { chat: (req: { model: string; messages: ChatMessage[]; max_tokens?: number; temperature?: number }) => AsyncIterable<ChatChunk> };
  config: { model: string };
}

export class OpLlmError extends Error {
  constructor(message: string, public raw: string) {
    super(message);
  }
}

async function completeOnce(ctx: LlmCtx, messages: ChatMessage[], maxTokens: number): Promise<string> {
  let out = '';
  for await (const chunk of ctx.getAdapter().chat({ model: ctx.config.model, messages, max_tokens: maxTokens, temperature: 0.2 })) {
    if (chunk.kind === 'delta') out += chunk.text;
    else if (chunk.kind === 'error') throw new OpLlmError(chunk.error, out);
  }
  return out;
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1]! : raw).trim();
  // Fall back to the outermost braces if there's prose around the JSON.
  if (!candidate.startsWith('{') && !candidate.startsWith('[')) {
    const start = candidate.search(/[{[]/);
    if (start >= 0) return candidate.slice(start);
  }
  return candidate;
}

export async function completeJson<T>(
  ctx: LlmCtx,
  opts: { system: string; user: string; schema: z.ZodType<T>; maxTokens?: number },
): Promise<T> {
  const maxTokens = opts.maxTokens ?? 4096;
  const base: ChatMessage[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ];

  let raw = await completeOnce(ctx, base, maxTokens);
  for (let attempt = 0; ; attempt++) {
    try {
      const parsed = opts.schema.safeParse(JSON.parse(extractJson(raw)));
      if (parsed.success) return parsed.data;
      throw new Error(parsed.error.issues[0]?.message ?? 'schema mismatch');
    } catch (e) {
      if (attempt >= 1) throw new OpLlmError(`Model output was not valid JSON for this operation: ${(e as Error).message}`, raw);
      raw = await completeOnce(
        ctx,
        [...base,
          { role: 'assistant', content: raw },
          { role: 'user', content: `That was not valid: ${(e as Error).message}. Respond again with ONLY the corrected JSON.` },
        ],
        maxTokens,
      );
    }
  }
}
