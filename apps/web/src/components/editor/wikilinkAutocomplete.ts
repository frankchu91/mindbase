import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';

let cache: Array<{ slug: string; title: string }> | null = null;
let cacheAt = 0;

/**
 * Union autocomplete candidates from the two markdown-file categories:
 *   - contributors/<user>/<date>.md → label "<user>/<date>", slug "<user>/<date>"
 *   - research/<slug>.md            → label + slug "<slug>"
 * (Keeps the {slug, title} return shape so downstream `[[slug]]` insertion
 * behavior in editors is unchanged.)
 */
async function fetchSlugs(): Promise<Array<{ slug: string; title: string }>> {
  if (cache && Date.now() - cacheAt < 60_000) return cache;
  try {
    const [contributorsRes, researchRes] = await Promise.all([
      fetch('/api/tree/contributors').then((r) => (r.ok ? r.json() : { users: {} })),
      fetch('/api/tree/research').then((r) => (r.ok ? r.json() : { files: [] })),
    ]);
    const items: Array<{ slug: string; title: string }> = [];
    const users = (contributorsRes as { users?: Record<string, Array<{ date: string }>> }).users ?? {};
    for (const [user, days] of Object.entries(users)) {
      for (const d of days) {
        const key = `${user}/${d.date}`;
        items.push({ slug: key, title: key });
      }
    }
    const research = (researchRes as { files?: Array<{ slug: string; title?: string }> }).files ?? [];
    for (const f of research) {
      items.push({ slug: f.slug, title: f.title ?? f.slug });
    }
    cache = items;
    cacheAt = Date.now();
    return cache;
  } catch {
    return cache ?? [];
  }
}

export async function wikilinkCompletions(ctx: CompletionContext): Promise<CompletionResult | null> {
  // Match [[ followed by zero or more non-bracket chars
  const before = ctx.matchBefore(/\[\[([^\]\n]*)/);
  if (!before) return null;
  if (before.text === '[[' && !ctx.explicit) return null;

  const query = before.text.slice(2).toLowerCase();
  const all = await fetchSlugs();
  const filtered = all
    .filter((p) => p.slug.includes(query) || p.title.toLowerCase().includes(query))
    .slice(0, 12);

  return {
    from: before.from + 2, // after [[
    options: filtered.map((p) => ({
      label: p.title,
      detail: p.slug,
      apply: `${p.slug}]]`,
      type: 'class',
    })),
    validFor: /^[^\]\n]*$/,
  };
}
