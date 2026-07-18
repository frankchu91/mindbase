export const topicTracker = {
  id: 'topic-tracker' as const,
  name: 'Topic Tracker',
  description: 'Open-ended — anything that grows over time.',
  schemaBody: `# Wiki Schema — Topic Tracker

## Project description

Generic open-ended catch-all. Use this when none of the more specific
templates fits — e.g. tracking a hobby, an ongoing interest, a community
you follow.

## Page conventions

Use whatever convention feels right. The defaults:
- H1 = canonical concept / entity name.
- Opening paragraph defines it.
- ## Sources — citations as [[raw:<id>]].
- ## Notes — your own observations.

## Page types
- Topic
- Entity (person, place, thing)
- Event / Update

## Linking conventions
Use \`related-to\` freely. Add specific edge types as patterns emerge.

## Ingest preferences
- Don't over-extract from a single source — favor depth over breadth.
- Skip pages that would only have one source — fold them into existing pages.
`,
};
