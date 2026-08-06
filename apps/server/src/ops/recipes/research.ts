// apps/server/src/ops/recipes/research.ts
//
// Research synthesizes a new research page. Two modes:
// - wiki-only (default): sources are the project's own pages
// - web (optional Brave Search key): top web results are fetched and
//   included as additional sources
import { z } from 'zod';
import { actionsSchema } from '../types';
import type { ProjectCore } from '../gather';

export interface ResearchSource { label: string; body: string }

export const researchSchema = z.object({
  actions: actionsSchema.min(1).max(3),
});
export type ResearchOutput = z.infer<typeof researchSchema>;

const SYSTEM = `You are MindBase's research analyst. Synthesize the provided
sources into ONE new research page. Respond with ONLY JSON:
{ "actions": [
    {"kind":"create_research_page","slug":"kebab-case-topic","markdown":"# Title\\n..."},
    {"kind":"append_context_section","section":"Open Questions","markdown":"- ..."}  // optional
] }
Page requirements: start with a one-paragraph answer; then findings as
sections; cite every claim with its source label in parentheses, e.g.
(source: sources/research/x.md) or (source: web — example.com); end with
an "Open questions" section. Only state what the sources support — say
"not covered by available sources" for the rest. Exactly one
create_research_page action; at most one append_context_section.`;

export function researchPrompt(input: {
  topic: string;
  core: ProjectCore;
  sources: ResearchSource[];
  mode: 'wiki-only' | 'web';
}): { system: string; user: string } {
  const sources = input.sources.length
    ? input.sources.map((s) => `--- ${s.label}\n${s.body}`).join('\n\n')
    : '(no sources found)';
  return {
    system: SYSTEM,
    user: `RESEARCH TOPIC: ${input.topic}\n\nMODE: ${input.mode === 'web' ? 'wiki + web results' : 'wiki-only (no web access)'}\n\ncontext.md (project state):\n${input.core.context || '(empty)'}\n\nSOURCES:\n${sources}\n\nProduce the JSON.`,
  };
}
