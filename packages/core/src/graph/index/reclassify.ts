import type { Store } from '../../storage/store';
import type { MetaJson } from '../../types';
import { extractWikilinks } from './extract-links';
import { classifyLinks } from './classify-edges';
import type { WikiIndex, PageUpsert } from './wiki-index';

export interface ReclassifyResult {
  pagesProcessed: number;
  linksUpdated: number;
  durationMs: number;
}

/**
 * Re-run the Phase-2 classifier across all existing links by reading each
 * source page's current body. Updates `edge_type` + `inference_rule` +
 * `confidence` (and snippet/section if changed). Idempotent — running on
 * an already-classified index produces no net writes (diff is empty).
 *
 * This is the upgrade path from Phase 1 to Phase 2: existing rows were
 * written with edge_type='mentions' / inference_rule=NULL; this rewrites
 * them per the classifier's verdict.
 */
export async function reclassify(store: Store, index: WikiIndex): Promise<ReclassifyResult> {
  const startedAt = Date.now();
  let pagesProcessed = 0;
  let linksUpdated = 0;

  for (const page of index.allPages()) {
    let body: string;
    try {
      body = await store.readText(page.path);
    } catch {
      continue;  // page on disk is gone — skip; reindex will sweep it later
    }

    let meta: MetaJson | null = null;
    try {
      meta = await store.readJSON<MetaJson>(`wiki/notes/${page.slug}.meta.json`);
    } catch { /* no sidecar */ }

    const extracted = extractWikilinks(body);
    const classified = classifyLinks(extracted, {
      pageSlug: page.slug,
      pageType: meta?.type ?? page.type,
      body,
    });

    // Track how many links would change vs. the current state.
    const before = index.outgoingFrom(page.slug);
    const keyFor = (l: { target_slug: string; edge_type: string; confidence: string; inference_rule: string | null }) =>
      `${l.target_slug}:${l.edge_type}:${l.confidence}:${l.inference_rule ?? ''}`;
    const beforeSet = new Set(before.map(keyFor));

    // Re-upsert with the original page row + freshly classified links.
    const upsert: PageUpsert = {
      slug: page.slug,
      path: page.path,
      title: page.title,
      type: page.type,
      kind: page.kind,
      contentHash: page.content_hash,
      wordCount: page.word_count,
      tags: page.tags,
      visibility: page.visibility,
      project: page.project,
      projectId: page.project_id,
      summary: page.summary,
      meta: page.meta,
    };
    index.upsertPage(upsert, classified);

    const after = index.outgoingFrom(page.slug);
    const afterSet = new Set(after.map(keyFor));
    let changed = 0;
    for (const k of afterSet) if (!beforeSet.has(k)) changed++;
    for (const k of beforeSet) if (!afterSet.has(k)) changed++;
    linksUpdated += changed;
    pagesProcessed++;
  }

  return { pagesProcessed, linksUpdated, durationMs: Date.now() - startedAt };
}
