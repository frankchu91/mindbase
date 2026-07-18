export const literatureReview = {
  id: 'literature-review' as const,
  name: 'Literature Review',
  description: 'Going deep on a research topic — papers, notes, an evolving thesis.',
  schemaBody: `# Wiki Schema — Literature Review

## Project description

Sustained inquiry into a research topic via papers, articles, and notes.
Sources are mostly PDFs and arxiv links; output is a wiki of methods,
findings, and an evolving thesis.

## Page conventions

Wiki/concepts pages:
- H1 = canonical concept name (e.g. "Retrieval-Augmented Generation").
- One opening paragraph defining the concept.
- ## Key claims — bulleted, each cited inline with [[raw:<id>]].
- ## Methods (when applicable).
- ## Open questions.

## Page types
- Concept (algorithm, method, theory)
- Paper (single citation, includes Abstract / Method / Result sections)
- Researcher / Author

## Linking conventions
Use \`cites\`, \`contradicts\`, \`supersedes\`, \`elaborates\` aggressively.

## Ingest preferences
- Extract aggressively from survey papers: 10-20 concept pages typical.
- Cite every claim with [[raw:<id>]].
`,
};
