export const definition = {
  name: 'explain',
  description: 'Re-explain a wiki page from first principles.',
  arguments: [{ name: 'slug', description: 'Page slug', required: true }],
};
export const template = (slug: string) => `Explain ${slug} from first principles.

Read the page using read_wiki_page. Then:
1. Restate the core idea in one sentence anyone could understand
2. Walk through the logic from scratch (don't assume the wiki's framing is right)
3. Identify any claims that seem ^[inferred] vs ^[extracted] — are they well-supported?
4. Note any obvious gaps or weak arguments
5. Suggest 2-3 sources I should read to fill gaps

Cite [[wikilinks]] throughout.`;
