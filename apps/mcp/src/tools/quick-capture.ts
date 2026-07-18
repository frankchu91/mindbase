// apps/mcp/src/tools/quick-capture.ts
import { z } from 'zod';
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { atomicWrite } from '../lib/safe-write.js';
import path from 'node:path';

const inputSchema = z.object({
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export const definition = {
  name: 'quick_capture',
  description: 'Save content to the inbox for later batch processing (NOT a direct wiki note). Use this for "save this for later, I will categorize it myself in the MindBase UI". To create a wiki note directly, use create_note instead.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['content'],
  },
};

export async function handle(ctx: Context, rawInput: unknown) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.issues[0]?.message ?? 'parse error'}`);
  const { content, tags } = parsed.data;

  try {
    const ts = new Date();
    const fname = `${ts.toISOString().replace(/[:.]/g, '-')}-capture.md`;
    const fmTags = tags && tags.length > 0 ? `\ntags: [${tags.map((t) => `"${t}"`).join(', ')}]` : '';
    const frontmatter = `---\ncaptured_at: ${ts.toISOString()}\ncreated_via: mcp\nmcp_client: ${ctx.mcpClient}\nmcp_tool: quick_capture${fmTags}\n---\n\n`;
    const filePath = path.join(ctx.dataDir, 'inbox', fname);
    await atomicWrite(filePath, frontmatter + content);
    return textResult({ path: filePath, captured_at: ts.toISOString() });
  } catch (e) {
    return errorResult(`quick_capture failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, (input) => handle(ctx, input));
  defs.push(definition);
}
