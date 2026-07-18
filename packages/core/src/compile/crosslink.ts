import type { Store } from '../storage/store';
import { crossLink } from '../graph/crosslinker';

export interface CrosslinkResult {
  linksAdded: number;
  pagesModified: number;
  details: Array<{ page: string; addedLinks: string[] }>;
}

/** Backwards-compatible wrapper. Calls the new graph-based cross-linker in auto mode. */
export async function runCrosslinker(store: Store): Promise<CrosslinkResult> {
  const r = await crossLink(store, { mode: 'auto' });
  const detailsByPage = new Map<string, string[]>();
  for (const s of r.suggestions.filter((x) => x.applied)) {
    if (!detailsByPage.has(s.page)) detailsByPage.set(s.page, []);
    detailsByPage.get(s.page)!.push(s.target);
  }
  return {
    linksAdded: r.applied,
    pagesModified: r.pagesModified.length,
    details: [...detailsByPage.entries()].map(([page, addedLinks]) => ({ page: `wiki/notes/${page}.md`, addedLinks })),
  };
}
