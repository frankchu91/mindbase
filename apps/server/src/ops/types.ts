// apps/server/src/ops/types.ts
//
// The action vocabulary server-side operations may emit. Deliberately
// mirrors the MCP tools' semantics, and deliberately contains NO action
// that can write under sources/contributors or sources/raw — the
// append-only layer is unreachable by schema, the same boundary the
// plugin enforces with sub-agent tool allowlists.
import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/, 'slug must be kebab-case [a-z0-9-]');

const linkTargetPath = z
  .string()
  .regex(/^(sources\/research\/[a-z0-9][a-z0-9-]*\.md|context\.md)$/, 'links may only target research pages or context.md');

export const actionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create_research_page'), slug, markdown: z.string().min(1).max(100_000) }),
  z.object({ kind: z.literal('update_context'), markdown: z.string().min(1).max(100_000) }),
  z.object({ kind: z.literal('append_context_section'), section: z.string().min(1).max(80), markdown: z.string().min(1).max(20_000) }),
  z.object({ kind: z.literal('add_wikilinks'), path: linkTargetPath, links: z.array(slug).min(1).max(10) }),
]);

export type Action = z.infer<typeof actionSchema>;

export const actionsSchema = z.array(actionSchema).max(20);

export interface ApplyResult {
  applied: string[];
  failed: Array<{ action: string; error: string }>;
}

export const CONTEXT_LINE_CAP = 400;
