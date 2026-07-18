import { createHash } from 'node:crypto';
import type { Store } from '../../storage/store';
import type { MetaJson } from '../../types';
import { extractWikilinks } from './extract-links';
import { classifyLinks } from './classify-edges';
import type { WikiIndex } from './wiki-index';
import { listAllWikiPages } from '../../storage/paths';
import { ProjectScopedStore } from '../../storage/project-scoped-store';
import { listProjects } from '../../projects/store';

export interface ReindexResult {
  pagesProcessed: number;
  pagesRemoved: number;
  linksWritten: number;
  durationMs: number;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function stripFrontmatter(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function wordCount(body: string): number {
  return stripFrontmatter(body).split(/\s+/).filter(Boolean).length;
}

/**
 * Full reindex: walk `wiki/notes/`, read every .md (plus .meta.json sidecar
 * if present), upsert into the index, and remove any phantom pages that
 * exist in the index but no longer on disk.
 *
 * Idempotent — running twice on an unchanged store yields the same state.
 * Pages with no .md content fall back to slug-derived title and default
 * type='concept'. Pages with malformed meta.json fall back to defaults
 * (we never crash on a bad meta file; we log and skip).
 */
export async function reindex(
  store: Store,
  index: WikiIndex,
  projectId: string = 'default',
): Promise<ReindexResult> {
  const startedAt = Date.now();
  let pagesProcessed = 0;
  let linksWritten = 0;

  const entries = await listAllWikiPages(store);
  const seenSlugs = new Set<string>();

  for (const entry of entries) {
    if (entry.kind !== 'file') continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name.endsWith('.meta.json')) continue;

    const slug = entry.name.replace(/\.md$/, '');
    seenSlugs.add(slug);

    let body = '';
    try {
      body = await store.readText(`wiki/${entry.layer}/${entry.name}`);
    } catch {
      continue; // unreadable — skip
    }

    let meta: MetaJson | null = null;
    try {
      meta = await store.readJSON<MetaJson>(`wiki/${entry.layer}/${slug}.meta.json`);
    } catch {
      // No sidecar; fall through with meta = null.
    }

    const contentHash = sha256(body);

    // Skip full upsert when nothing has changed (keeps updated_at stable).
    const existing = index.getPage(slug);
    if (existing && existing.content_hash === contentHash) {
      linksWritten += index.outgoingFrom(slug).length;
      pagesProcessed++;
      continue;
    }

    const extracted = extractWikilinks(body);
    const classified = classifyLinks(extracted, {
      pageSlug: slug,
      pageType: meta?.type ?? 'concept',
      body,
    });
    linksWritten += classified.length;

    index.upsertPage({
      slug,
      path: `wiki/notes/${entry.name}`,
      title: meta?.title ?? slug,
      type: meta?.type ?? 'concept',
      kind: (meta as { kind?: string } | null)?.kind ?? null,
      contentHash,
      wordCount: wordCount(body),
      tags: Array.isArray(meta?.tags) ? meta.tags.slice(0, 3) : [],
      visibility: (meta as { visibility?: string } | null)?.visibility ?? null,
      project: (meta as { project?: string } | null)?.project ?? null,
      projectId,
      summary: (meta as { summary?: string } | null)?.summary ?? null,
      meta: meta as Record<string, unknown> | null,
    }, classified);

    pagesProcessed++;
  }

  // Sweep phantoms — only within this project. allPages() now returns rows
  // from every project (unified graph), so filter by project_id before
  // deciding what's gone.
  let pagesRemoved = 0;
  for (const p of index.allPages()) {
    if (p.project_id !== projectId) continue;
    if (!seenSlugs.has(p.slug)) {
      index.deletePage(p.slug);
      pagesRemoved++;
    }
  }

  return {
    pagesProcessed,
    pagesRemoved,
    linksWritten,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Reindex EVERY project under `projects/<id>/wiki/` into one unified graph.
 * Called at boot in the multi-project unified-graph mode (Option B). After
 * this runs, `switchProject` no longer needs to rebuild — it just changes
 * which project's view is shown.
 *
 * The unscoped `rawStore` is required so we can enumerate `projects/`. Each
 * project then gets a `ProjectScopedStore` wrapper so the existing reindex
 * logic (which expects paths relative to `wiki/`) works unchanged.
 *
 * If `projects/` doesn't exist (fresh install, legacy flat layout), falls
 * back to reindexing the rawStore as a single 'default' project.
 */
export async function reindexAllProjects(
  rawStore: Store,
  index: WikiIndex,
): Promise<ReindexResult & { projectCount: number }> {
  const startedAt = Date.now();
  const projects = await listProjects(rawStore);

  if (projects.length === 0) {
    // Fall back to single-project mode (flat ~/mindbase-data/wiki/).
    const r = await reindex(rawStore, index, 'default');
    return { ...r, projectCount: 1, durationMs: Date.now() - startedAt };
  }

  let pagesProcessed = 0;
  let pagesRemoved = 0;
  let linksWritten = 0;
  for (const p of projects) {
    const scoped = new ProjectScopedStore(rawStore, p.id);
    const r = await reindex(scoped, index, p.id);
    pagesProcessed += r.pagesProcessed;
    pagesRemoved += r.pagesRemoved;
    linksWritten += r.linksWritten;
  }
  return {
    pagesProcessed,
    pagesRemoved,
    linksWritten,
    projectCount: projects.length,
    durationMs: Date.now() - startedAt,
  };
}
