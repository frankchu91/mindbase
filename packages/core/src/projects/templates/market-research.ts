export const marketResearch = {
  id: 'market-research' as const,
  name: 'Market Research',
  description: 'Companies, products, competitor landscape.',
  schemaBody: `# Wiki Schema — Market Research

## Project description

Track companies, products, and the competitive landscape in a market.
Sources are press releases, product pages, analyst reports, earnings calls,
news articles.

## Page conventions

Wiki/concepts pages:
- H1 = canonical company / product / feature name.
- ## Snapshot — 2-3 sentence definitional paragraph (what they are, who they sell to).
- ## Key facts — bulleted (HQ, employees, funding, ARR if known) with [[raw:<id>]] citations.
- ## Positioning — how they describe themselves.
- ## Comparisons — links to direct competitors via [[other-company]].

## Page types
- Company
- Product
- Feature (cross-cutting)
- Market segment / category

## Linking conventions
Use \`competes-with\`, \`acquired-by\`, \`partners-with\`, \`built-on\` aggressively.

## Ingest preferences
- For press releases / blog posts: create or update the relevant Company page.
- For analyst reports: extract company-level facts, link cross-company comparisons.
`,
};
