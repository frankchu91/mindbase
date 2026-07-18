export const definition = {
  name: 'quiz',
  description: 'Quiz me on what I\'ve recently learned.',
  arguments: [],
};
export const template = `Quiz me on what I've recently learned.

Use list_recent (last 7 days) to find what I've ingested. For each page, generate 1-2 questions:
- Mix difficulty: factual recall, application, synthesis
- Include the page slug so I can verify the answer

Format as numbered questions. After all questions, append "Press enter to reveal answers." Then provide answers with [[wikilinks]] to source pages.`;
