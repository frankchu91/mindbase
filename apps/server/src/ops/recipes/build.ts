// apps/server/src/ops/recipes/build.ts
import { z } from 'zod';
import { actionsSchema, CONTEXT_LINE_CAP } from '../types';
import type { ProjectCore, SourceFile } from '../gather';

export const buildSchema = z.object({ actions: actionsSchema.min(1) });
export type BuildOutput = z.infer<typeof buildSchema>;

const SYSTEM = `You are MindBase's context builder. Your single job: rewrite
context.md so it reflects everything in the unbuilt sources, folded into
the existing document. Respond with ONLY JSON:
{ "actions": [ {"kind":"update_context","markdown":"<FULL new context.md>"} ] }
Optionally add {"kind":"create_research_page",...} actions BEFORE the
update when a source deserves its own concept page (rare; at most 2).
Constraints: keep the document under ${CONTEXT_LINE_CAP - 20} lines; keep the
existing section structure (Current Focus / Active Topics / Key Decisions /
Learnings / Open Questions / Blockers) unless the project README says
otherwise; date new decisions/learnings (YYYY-MM-DD); preserve still-true
content; flag contradictions between sources explicitly with ⚠️.`;

export function buildPrompt(input: { core: ProjectCore; sources: SourceFile[]; today: string }): { system: string; user: string } {
  const sources = input.sources.map((s) => `--- ${s.path}\n${s.body}`).join('\n\n');
  return {
    system: SYSTEM,
    user: `TODAY: ${input.today}\n\nPROJECT RULES (README.md):\n${input.core.readme || '(none)'}\n\nCURRENT context.md:\n${input.core.context || '(empty — write the first version)'}\n\nUNBUILT SOURCES (newest first):\n${sources || '(none — polish the existing document only)'}\n\nProduce the JSON.`,
  };
}
