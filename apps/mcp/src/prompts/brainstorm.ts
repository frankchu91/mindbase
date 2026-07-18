export const definition = {
  name: 'brainstorm',
  description: 'Brainstorm a topic, grounded in my wiki.',
  arguments: [{ name: 'topic', description: 'What to brainstorm about', required: true }],
};
export const template = (topic: string) => `Help me brainstorm about ${topic}.

First, search my wiki using search_wiki and find_related to gather what I already know. Read the top 5 pages with read_wiki_page.

Then propose 5-7 angles to explore, each grounded in specific [[wikilinks]] from my wiki. After each angle, suggest one specific follow-up question.

If you find gaps (areas my wiki doesn't cover), call them out explicitly.`;
