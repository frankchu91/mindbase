// apps/server/src/ops/recipes/contribute.ts
import { z } from 'zod';
import { actionsSchema } from '../types';
import type { ProjectCore } from '../gather';

export interface RelatedPage { path: string; excerpt: string }

export const contributePlanSchema = z.object({
  takeaways: z.array(z.string().min(1)).min(1).max(5),
  plan: actionsSchema,
});
export type ContributePlan = z.infer<typeof contributePlanSchema>;

const SYSTEM = `You are MindBase's wiki maintainer. The project has three layers:
- sources/ is the user's append-only input layer. You NEVER write there.
- context.md is the synthesized "current thinking" document you maintain.
- sources/research/ holds concept pages you create and update.

You respond with ONLY a JSON object, no prose, matching:
{
  "takeaways": ["..."],            // 1-3 key takeaways of the new entry
  "plan": [Action, ...]            // the minimal set of wiki updates
}
Action is EXACTLY one of:
  {"kind":"create_research_page","slug":"kebab-case","markdown":"# Title\\n..."}
  {"kind":"update_context","markdown":"<the FULL rewritten context.md>"}
  {"kind":"append_context_section","section":"Learnings","markdown":"- ..."}
  {"kind":"add_wikilinks","path":"sources/research/<slug>.md","links":["other-slug"]}
Rules: prefer appending to context sections over full rewrites; create at
most ONE new research page and only when the entry introduces a genuinely
new concept; link related pages with add_wikilinks; never invent other
action kinds; keep markdown concise.`;

export function contributePrompt(input: { text: string; core: ProjectCore; related: RelatedPage[] }): { system: string; user: string } {
  const related = input.related.length
    ? input.related.map((r) => `--- ${r.path}\n${r.excerpt}`).join('\n')
    : '(none found)';
  return {
    system: SYSTEM,
    user: `NEW ENTRY from the user:\n${input.text}\n\nCURRENT context.md:\n${input.core.context || '(empty)'}\n\nPROJECT RULES (README.md):\n${input.core.readme || '(none)'}\n\nRELATED EXISTING PAGES:\n${related}\n\nProduce takeaways + the minimal update plan as JSON.`,
  };
}
