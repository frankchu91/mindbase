// apps/mcp/src/tools/find-orphans.ts
import type { Context } from '../context.js';
import { textResult, errorResult } from '../lib/error.js';
import { getOrphans } from '@mindbase/core';

export const definition = {
  name: 'find_orphans',
  description: 'List wiki pages with no incoming links (orphans).',
  inputSchema: { type: 'object', properties: {} },
};

export async function handle(ctx: Context) {
  try {
    const graph = ctx.wikiIndex.buildGraph();
    const orphans = getOrphans(graph).map((slug) => ({
      slug,
      title: graph.nodes.get(slug)?.title ?? slug,
      one_liner: graph.nodes.get(slug)?.summary ?? '',
    }));
    return textResult(orphans);
  } catch (e) {
    return errorResult(`find_orphans failed: ${(e as Error).message}`);
  }
}

export function register(handlers: Map<string, (input: unknown) => Promise<unknown>>, defs: object[], ctx: Context): void {
  handlers.set(definition.name, () => handle(ctx));
  defs.push(definition);
}
