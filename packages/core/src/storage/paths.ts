export function rawPath(date: string, id: string): string {
  return `raw/${date}/${id}.md`;
}

export function rawMetaPath(date: string, id: string): string {
  return `raw/${date}/${id}.meta.json`;
}

// ── 3-layer architecture (Karpathy LLM-Wiki spec) ──
//
// Per docs/llm-wiki.md + docs/pivot-plan-2026-05-25.md, the wiki has
// physically distinct layers:
//
//   wiki/notes/    — USER-OWNED. Drafts, journal entries, manual edits.
//                    Lives here only while the user is actively writing.
//   wiki/concepts/ — LLM-OWNED. Distilled wiki pages the agent maintains.
//                    "You read it; the LLM writes it." (Karpathy)
//   wiki/sources/  — provenance stubs ("cited in: [[X]]"), one per raw doc.
//
// The previous implementation aliased conceptPath → notePath, collapsing
// the LLM-owned layer into the user-owned layer. That is THE architecture
// violation that made compile output feel like "AI rewriting my note."

export function conceptPath(slug: string): string {
  return `wiki/concepts/${slug}.md`;
}

export function conceptMetaPath(slug: string): string {
  return `wiki/concepts/${slug}.meta.json`;
}

// Article view shares the read path for now — readers fall back across both
// dirs (see findWikiPagePath helper). Use conceptPath for writes from compile.
export function articlePath(slug: string): string {
  return conceptPath(slug);
}

export function articleMetaPath(slug: string): string {
  return conceptMetaPath(slug);
}

export function notePath(slug: string): string {
  return `wiki/notes/${slug}.md`;
}

export function noteMetaPath(slug: string): string {
  return `wiki/notes/${slug}.meta.json`;
}

/**
 * Resolve which directory a slug currently lives in. During the migration
 * period some pages still live in wiki/notes/ even though they're concept-
 * type. Callers reading a page should try concepts/ first (the new home),
 * then notes/ (legacy / user-written). Returns null if not found.
 */
export async function findWikiPagePath(
  exists: (path: string) => Promise<boolean>,
  slug: string,
): Promise<{ md: string; meta: string; layer: 'concepts' | 'notes' } | null> {
  if (await exists(conceptPath(slug))) {
    return { md: conceptPath(slug), meta: conceptMetaPath(slug), layer: 'concepts' };
  }
  if (await exists(notePath(slug))) {
    return { md: notePath(slug), meta: noteMetaPath(slug), layer: 'notes' };
  }
  return null;
}

export interface WikiPageEntry {
  /** Filename inside the layer dir (e.g. "frodo.meta.json"). */
  name: string;
  kind: 'file' | 'directory';
  /** Which layer this entry came from. concepts/ = LLM-owned, notes/ = user-owned. */
  layer: 'concepts' | 'notes';
}

/**
 * List entries from both wiki layers (concepts + notes), tagged with their
 * origin. Replaces the old `store.listDir('wiki/notes')` pattern which only
 * saw the user-owned layer and missed all LLM-compiled pages.
 *
 * Returns concepts first, then notes. Missing directories are treated as
 * empty (no throw) so this is safe to call on fresh installs.
 */
export async function listAllWikiPages(
  store: {
    listDir(path: string): Promise<Array<{ name: string; kind: 'file' | 'directory' }>>;
  },
): Promise<WikiPageEntry[]> {
  const out: WikiPageEntry[] = [];
  for (const layer of ['concepts', 'notes'] as const) {
    let entries: Array<{ name: string; kind: 'file' | 'directory' }> = [];
    try {
      entries = await store.listDir(`wiki/${layer}`);
    } catch {
      // Directory doesn't exist yet — fine.
    }
    for (const e of entries) out.push({ ...e, layer });
  }
  return out;
}

export function sourcesPath(rawId: string): string {
  return `wiki/sources/${rawId}.md`;
}

export function indexPath(): string {
  return `wiki/INDEX.md`;
}

export function manifestPath(): string {
  return `meta/manifest.json`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function todayDir(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
