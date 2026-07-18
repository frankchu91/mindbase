export const definition = {
  name: 'daily-digest',
  description: 'Summarize what was added to my MindBase wiki today.',
  arguments: [],
};
export const template = `Use the mindbase://recent resource and the list_recent tool to identify everything added in the past 24 hours. Write a concise digest:
- 3-bullet summary of themes
- New entities or concepts introduced
- 2-3 questions worth exploring next

Use [[wikilinks]] when referencing pages.`;
