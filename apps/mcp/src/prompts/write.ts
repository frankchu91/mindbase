export const definition = {
  name: 'write',
  description: 'Write a long-form piece grounded in my wiki.',
  arguments: [{ name: 'topic', description: 'What to write about', required: true }],
};
export const template = (topic: string) => `Write a long-form piece about ${topic}, grounded in my wiki.

Step 1: Use search_wiki and semantic_search to find all relevant pages.
Step 2: Use find_related on the top 3 to discover supporting context.
Step 3: Read the top 5-8 pages with read_wiki_page.
Step 4: Compose a coherent ~1500-word piece that:
  - Has a strong thesis
  - Uses [[wikilinks]] inline (not just at the end) — every claim should link to its source
  - Marks any inferred claims with ^[inferred]
  - Ends with "Sources" and "Open questions" sections`;
