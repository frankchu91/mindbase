export const definition = {
  name: 'audit',
  description: 'Audit my wiki for health issues and propose fixes.',
  arguments: [],
};
export const template = `Audit my wiki for health issues.

Call run_wiki_health to run the full analysis. Then:
1. List the top 5 most important things to fix (with specific page slugs)
2. Identify the most valuable orphan to integrate (and suggest where to link it from)
3. Flag any broken links and propose fixes
4. Note fragmented tag clusters that should be split or merged

Format as a checklist I can work through.`;
