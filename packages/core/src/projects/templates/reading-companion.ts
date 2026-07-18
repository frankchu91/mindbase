export const readingCompanion = {
  id: 'reading-companion' as const,
  name: 'Reading Companion',
  description: 'Build a wiki for a book — characters, places, events.',
  schemaBody: `# Wiki Schema — Reading Companion

## Project description

Build a Tolkien-Gateway-style wiki for a book (or book series) as you
read. Sources are the chapters themselves, plus secondary material
(letters, essays, interviews).

## Page conventions

Wiki/concepts pages:
- H1 = canonical entity name (character, place, event, theme).
- One sentence definition ("Frodo Baggins is a hobbit of the Shire…").
- ## Appearances — bulleted chapter references with [[raw:<chapter-id>]].
- ## Notes — interpretive observations.

## Page types
- Character
- Place
- Event / Plot point
- Theme / Concept
- Object / Artifact

## Linking conventions
Use \`appears-with\`, \`travels-to\`, \`possesses\`, \`opposes\`, \`related-theme\`.

## Ingest preferences
- Don't spoil ahead of where the user has read — track the reading position via the project's notes layer.
- Prefer adding to existing pages over creating new ones for one-off mentions.
`,
};
