import type { ServerContext } from '../context';
import type { ToolCall } from '@mindbase/core';
import type { ToolResult } from '@mindbase/core';

export async function appendChangesLog(
  ctx: ServerContext,
  toolResults: Array<{ call: ToolCall; result: ToolResult }>,
  rawId: string,
): Promise<void> {
  const mutateActions = toolResults
    .filter((tr) => tr.call.name !== 'read_concept' && tr.result.ok);
  if (mutateActions.length === 0) return;
  const ts = new Date().toISOString();
  const changeLines = mutateActions.map((tr) => {
    const args = tr.call.arguments as Record<string, unknown>;
    const target = (args.concept_name ?? args.note_name ?? args.name ?? args.slug ?? '?') as string;
    const detail = (args.section ?? args.reason ?? '') as string;
    return `- [${ts}] ${tr.call.name} | ${target}${detail ? ` | ${detail}` : ''} | source:${rawId}`;
  }).join('\n');
  let changesBody = '';
  try {
    changesBody = await ctx.store.readText('wiki/_changes.md');
  } catch {
    changesBody = '# Wiki Changes Audit Log\n\nAppend-only log of every mutation made to the wiki by the LLM. Each line records the action, target, and source raw_id that triggered it.\n\n';
  }
  changesBody = `${changesBody.trimEnd()}\n${changeLines}\n`;
  await ctx.store.writeText('wiki/_changes.md', changesBody);
}
