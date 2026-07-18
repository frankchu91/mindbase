export const investigation = {
  id: 'investigation' as const,
  name: 'Investigation',
  description: 'Case files, evidence, timeline events.',
  schemaBody: `# Wiki Schema — Investigation

## Project description

Build a case file: people, places, organizations, events, evidence, and
the timeline that ties them together. Sources can be transcripts,
documents, news, court filings, photos.

## Page conventions

Wiki/concepts pages:
- H1 = entity name (Person, Place, Org, Event).
- ## Identity — who/what is this, basic identifying facts.
- ## Timeline — bulleted chronological entries cited with [[raw:<id>]].
- ## Connections — links to related entities ([[other-entity]]).
- ## Open questions — what's still uncertain.

## Page types
- Person
- Organization
- Place
- Event
- Document / Evidence item

## Linking conventions
Use \`met-with\`, \`worked-at\`, \`witnessed\`, \`mentioned-in\`, \`contradicts\` aggressively.

## Ingest preferences
- Every claim cited with [[raw:<id>]].
- Flag contradictions between sources — don't smooth them over.
- Timeline entries should include date when known.
`,
};
