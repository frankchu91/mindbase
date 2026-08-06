// apps/server/src/ops/recipes/lint.ts
//
// Lint emits findings only — it never writes to the wiki. Findings are
// cached to artifacts/lint/<date>.json by the runner so the Health view
// persists across reloads.
import { z } from 'zod';
import type { ProjectCore, ResearchPage } from '../gather';

export const FINDING_KINDS = [
  'contradiction',
  'stale',
  'orphan',
  'missing_page',
  'missing_link',
  'gap',
  'question',
] as const;

export const findingSchema = z.object({
  kind: z.enum(FINDING_KINDS),
  pages: z.array(z.string().min(1)).max(6),
  detail: z.string().min(1).max(600),
});
export type Finding = z.infer<typeof findingSchema>;

export const lintSchema = z.object({
  findings: z.array(findingSchema).max(20),
});
export type LintOutput = z.infer<typeof lintSchema>;

const SYSTEM = `You are MindBase's wiki health checker. You READ the project
and report problems — you never propose edits. Respond with ONLY JSON:
{ "findings": [ { "kind": "...", "pages": ["path-or-slug", ...], "detail": "..." }, ... ] }
kind is EXACTLY one of:
  contradiction — two pages/claims that disagree; quote both sides in detail
  stale         — a claim likely superseded by newer content
  orphan        — a page nothing links to (use the provided inbound counts)
  missing_page  — a concept referenced repeatedly but with no page of its own
  missing_link  — two clearly related pages that don't reference each other
  gap           — a question the project raises but never answers
  question      — a suggested next question worth investigating
Rules: every finding must cite the specific page paths in "pages"; detail is
1-3 sentences, concrete, quoting the conflicting text when relevant; do not
invent pages that were not provided; return at most 12 findings, the most
important first; an empty findings array is a valid answer for a healthy wiki.`;

export function lintPrompt(input: { core: ProjectCore; pages: ResearchPage[] }): { system: string; user: string } {
  const graph = input.pages
    .map((p) => `- ${p.path} (inbound: ${p.inboundCount}${p.outbound.length ? `, links to: ${p.outbound.join(', ')}` : ''})`)
    .join('\n');
  const excerpts = input.pages.map((p) => `--- ${p.path}\n${p.excerpt}`).join('\n\n');
  return {
    system: SYSTEM,
    user: `context.md (curated truth — cite it as "context.md"):\n${input.core.context || '(empty)'}\n\nLINK GRAPH (deterministic — trust these inbound counts):\n${graph || '(no research pages)'}\n\nPAGE EXCERPTS:\n${excerpts || '(none)'}\n\nReport findings as JSON.`,
  };
}
