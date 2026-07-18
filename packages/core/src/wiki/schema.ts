/**
 * wiki/schema.md — Karpathy's "third layer" of the LLM-Wiki pattern.
 *
 * From docs/llm-wiki.md (Architecture section):
 *
 *   "The schema — a document (e.g. CLAUDE.md for Claude Code or AGENTS.md
 *    for Codex) that tells the LLM how the wiki is structured, what the
 *    conventions are, and what workflows to follow when ingesting sources,
 *    answering questions, or maintaining the wiki. This is the key
 *    configuration file — it's what makes the LLM a disciplined wiki
 *    maintainer rather than a generic chatbot. You and the LLM co-evolve
 *    this over time as you figure out what works for your domain."
 *
 * This module:
 *   - ensures wiki/schema.md exists (creates a sensible default if missing)
 *   - exposes loadSchema() so prompts can read it at runtime
 *
 * For now schema.md is a single global file. When per-project scope ships
 * (pivot plan Phase 2), each project gets its own schema in
 * projects/<project>/wiki/schema.md.
 */

import type { Store } from '../storage/store';

export const SCHEMA_PATH = 'wiki/schema.md';

/** Default schema for a fresh MindBase wiki. Editable by the user. */
export const DEFAULT_SCHEMA = `# MindBase Wiki Schema

_This is the user-editable contract between you and the LLM that maintains
your wiki. The LLM reads it before every compile, query, and lint to know
how YOU want your knowledge base structured. Co-evolve this file as you
discover what works._

## Project description

Personal research wiki — used to accumulate, structure, and cross-reference
everything I read on the topics I care about. Sources include papers, web
articles, PDFs, podcast notes, and meeting transcripts.

## Page conventions

Every wiki/concepts/ page should have:

- **Frontmatter**: title, tags, sources (raw doc ids), created, updated.
- **A single H1** matching the title.
- **One paragraph at the top** stating what this concept is, in one sentence
  for the reader who's never heard of it.
- **One or more H2 sections** elaborating. Common section names:
  - "What it is"
  - "Why it matters"
  - "Open questions"
  - "Evidence" or "Sources" with inline \`[[raw:<id>]]\` citations.
- **At least one \`[[wikilink]]\`** to a related concept page when the
  related concept exists.

Avoid:
- Marketing prose, hype, or unsupported claims.
- Long-form direct quotes from sources (paraphrase instead).
- Section headers below H3 (keep page structure shallow).

## Page types

Use these types as a guide when extracting from sources. The LLM picks
the right type by content.

- **Concept** — an idea, method, theory, principle (e.g. \`hypothetical-documents\`).
- **Entity** — a person, paper, project, organization (e.g. \`andrej-karpathy\`).
- **Claim** — a specific assertion that could be supported or contested.

## Linking conventions

Use typed links when the relationship is non-trivial:

- \`mentions\` — page touches on the other (weakest link).
- \`elaborates\` — page goes into more detail on the other.
- \`cites\` — page references the other as a source / authority.
- \`contradicts\` — page disagrees with a claim on the other.
- \`supersedes\` — newer evidence makes the other page stale.
- \`is_a\` — taxonomic ("Faster R-CNN \`is_a\` object detector").
- \`part_of\` — compositional ("RPN \`part_of\` Faster R-CNN").
- \`example_of\` — instance of an abstract concept.

## Ingest workflow preferences

- **Extraction volume**: aim for 5-15 distinct concept/entity pages per
  substantive source. Don't settle for "this source = one page."
- **Approval mode**: interactive for the first sources in a new project;
  batch (no approval) once I'm comfortable with how the LLM is structuring.
- **Style**: prefer terse, evidence-anchored prose over comprehensive
  prose. I'd rather see "ColBERT outperforms BM25 (4-15% MRR) [[raw:abc123]]"
  than a paragraph of context.

## What this file is NOT

- Not where I write notes (use Drafts tab).
- Not the wiki itself (the wiki lives in wiki/concepts/).
- Not a prompt — the LLM uses this as context, not as a literal instruction.
`;

/**
 * Ensure wiki/schema.md exists. If absent, write the default. Returns true
 * if a file was created, false if it already existed.
 */
export async function ensureSchema(store: Store): Promise<boolean> {
  if (await store.exists(SCHEMA_PATH)) return false;
  await store.writeText(SCHEMA_PATH, DEFAULT_SCHEMA);
  return true;
}

/**
 * Read the current schema (user-edited or default). Returns the default
 * text if the file is missing — so callers can always show SOMETHING
 * without crashing on a fresh install.
 */
export async function loadSchema(store: Store): Promise<string> {
  try {
    return await store.readText(SCHEMA_PATH);
  } catch {
    return DEFAULT_SCHEMA;
  }
}
