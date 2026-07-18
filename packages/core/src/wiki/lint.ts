/**
 * Wiki lint — the killer feature Karpathy spec'd that Notion / NotebookLM /
 * Obsidian can't do (docs/llm-wiki.md):
 *
 *   "Periodically, ask the LLM to health-check the wiki. Look for:
 *    contradictions between pages, stale claims that newer sources have
 *    superseded, orphan pages with no inbound links, important concepts
 *    mentioned but lacking their own page, missing cross-references,
 *    data gaps that could be filled with a web search."
 *
 * Phase-1 lint v0 covers the deterministic checks (no LLM call needed):
 *   - ORPHAN PAGES — concept pages with no inbound wikilinks
 *   - MISSING CONCEPTS — wikilinks pointing to pages that don't exist
 *   - STALE CLAIMS  — concept pages not updated in N days while their sources
 *     have been updated more recently (likely needs re-compile)
 *
 * Deferred to lint v1 (need LLM):
 *   - Contradictions between page bodies
 *   - Suggested investigations / new sources to look for
 *   - Web-search-fillable data gaps
 */

import type { Store } from '../storage/store';
import type { WikiIndex } from '../graph/index/wiki-index';
import type { MetaJson } from '../types';
import { listAllWikiPages } from '../storage/paths';

export interface LintFinding {
  kind: 'orphan' | 'missing-concept' | 'stale-page' | 'cross-project-duplicate';
  /** Slug of the wiki page (for orphan / stale / duplicate). For missing-concept, the absent slug. */
  slug: string;
  /** Display title (best-effort). */
  title: string;
  /** Human-readable explanation. */
  reason: string;
  /** Optional structured context. */
  details?: Record<string, unknown>;
}

export interface LintReport {
  generated_at: string;
  total_pages_checked: number;
  findings: LintFinding[];
  byKind: {
    orphan: number;
    'missing-concept': number;
    'stale-page': number;
    'cross-project-duplicate': number;
  };
}

const DEFAULT_STALE_DAYS = 90;

export interface LintOptions {
  /** A page is "stale" if not updated in this many days. Default 90. */
  staleDays?: number;
  /** Cap on findings per kind (so noisy wikis don't dump 500-item lists). */
  maxPerKind?: number;
  /** Identifier of the project being linted (for cross-project duplicate context). */
  currentProjectId?: string;
  /** When true, include the cross-project duplicate check. */
  allProjects?: boolean;
}

/**
 * Run lint on the wiki. Pure deterministic — no LLM, no network.
 * Reads from the WikiIndex (typed graph) for inbound/outbound counts and
 * from the on-disk meta.json files for timestamps.
 */
export async function lintWiki(
  store: Store,
  wikiIndex: WikiIndex,
  opts: LintOptions = {},
): Promise<LintReport> {
  const staleDays = opts.staleDays ?? DEFAULT_STALE_DAYS;
  const maxPerKind = opts.maxPerKind ?? 50;
  const findings: LintFinding[] = [];

  // Snapshot all pages from disk (concepts + drafts both layers).
  const entries = await listAllWikiPages(store);
  const pagesBySlug = new Map<string, { meta: MetaJson; layer: 'concepts' | 'notes' }>();
  for (const e of entries) {
    if (e.kind !== 'file' || !e.name.endsWith('.meta.json')) continue;
    const slug = e.name.replace(/\.meta\.json$/, '');
    try {
      const meta = await store.readJSON<MetaJson>(`wiki/${e.layer}/${e.name}`);
      pagesBySlug.set(slug, { meta, layer: e.layer });
    } catch { /* skip */ }
  }

  // ─── ORPHAN PAGES ─────────────────────────────────────────────────
  // Concept pages with zero inbound links. We focus on the LLM-owned
  // layer (concepts/) because drafts being orphans is the user's call.
  const orphans: LintFinding[] = [];
  for (const [slug, { meta, layer }] of pagesBySlug) {
    if (layer !== 'concepts') continue;
    const inbound = wikiIndex.incomingTo(slug);
    if (inbound.length === 0) {
      orphans.push({
        kind: 'orphan',
        slug,
        title: meta.title ?? slug,
        reason: 'No other page links to this concept. Either it should be linked from somewhere or it should be merged into a more general page.',
      });
    }
  }
  orphans.sort((a, b) => a.title.localeCompare(b.title));
  findings.push(...orphans.slice(0, maxPerKind));

  // ─── MISSING CONCEPTS ─────────────────────────────────────────────
  // Wikilinks point to slugs that don't have a concept page. Walk every
  // page's outgoing links and check the target exists. Dedupe.
  const missingMap = new Map<string, { mentionedBy: string[] }>();
  for (const [sourceSlug] of pagesBySlug) {
    const outgoing = wikiIndex.outgoingFrom(sourceSlug);
    for (const link of outgoing) {
      const target = link.target_slug;
      if (pagesBySlug.has(target)) continue;
      // Skip raw-source pseudo-targets like "raw:foo" — these are source
      // citations, not real wikilinks to a missing concept. The extractor
      // currently strips the colon ([[raw:abc]] -> "rawabc"), so we filter
      // both forms.
      if (target.startsWith('raw:')) continue;
      if (/^raw[a-z0-9-]{4,}$/.test(target)) continue;
      const existing = missingMap.get(target);
      if (existing) {
        if (!existing.mentionedBy.includes(sourceSlug)) existing.mentionedBy.push(sourceSlug);
      } else {
        missingMap.set(target, { mentionedBy: [sourceSlug] });
      }
    }
  }
  const missing: LintFinding[] = [];
  for (const [slug, { mentionedBy }] of missingMap) {
    missing.push({
      kind: 'missing-concept',
      slug,
      title: slug,
      reason: `Mentioned by ${mentionedBy.length} page${mentionedBy.length > 1 ? 's' : ''} but no concept page exists yet.`,
      details: { mentionedBy: mentionedBy.slice(0, 5) },
    });
  }
  // Surface most-mentioned first
  missing.sort((a, b) => {
    const ax = (a.details?.['mentionedBy'] as string[] | undefined)?.length ?? 0;
    const bx = (b.details?.['mentionedBy'] as string[] | undefined)?.length ?? 0;
    return bx - ax;
  });
  findings.push(...missing.slice(0, maxPerKind));

  // ─── STALE PAGES ─────────────────────────────────────────────────
  // Concept pages not updated in N days, where at least one of their cited
  // sources has been updated more recently. This is a "newer evidence
  // exists, page may be out of date" signal.
  const staleCutoff = Date.now() - staleDays * 24 * 3600_000;
  const stale: LintFinding[] = [];
  for (const [slug, { meta, layer }] of pagesBySlug) {
    if (layer !== 'concepts') continue;
    const updated = Date.parse(meta.updated ?? '');
    if (!Number.isFinite(updated) || updated > staleCutoff) continue;
    const sources = Array.isArray(meta.sources) ? meta.sources : [];
    // Cheap signal: any source updated > page's updated time?
    // For Day-1 lint v0 we just flag by age. Source-update comparison
    // requires reading raw doc metas — deferred.
    stale.push({
      kind: 'stale-page',
      slug,
      title: meta.title ?? slug,
      reason: `Not updated in over ${staleDays} days (last update: ${meta.updated ?? 'unknown'}). Consider re-compiling its sources or marking it canonical.`,
      details: { lastUpdated: meta.updated, sources: sources.slice(0, 3) },
    });
  }
  stale.sort((a, b) => {
    const au = (a.details?.['lastUpdated'] as string | undefined) ?? '';
    const bu = (b.details?.['lastUpdated'] as string | undefined) ?? '';
    return au.localeCompare(bu);
  });
  findings.push(...stale.slice(0, maxPerKind));

  // ─── CROSS-PROJECT DUPLICATES ────────────────────────────────────
  // Same slug exists in 2+ projects → either it's the same concept and the
  // user should bridge with [[<proj>/<slug>]], or it's accidental name
  // collision and one should be renamed. Either way it's worth surfacing.
  //
  // Skipped unless explicitly enabled (allProjects) — single-project users
  // get nothing surprising.
  if (opts.allProjects) {
    const current = opts.currentProjectId ?? 'default';
    const slugToProjects = new Map<string, { projectIds: string[]; titles: string[] }>();
    for (const p of wikiIndex.allPages()) {
      const entry = slugToProjects.get(p.slug);
      if (entry) {
        if (!entry.projectIds.includes(p.project_id)) {
          entry.projectIds.push(p.project_id);
          entry.titles.push(p.title);
        }
      } else {
        slugToProjects.set(p.slug, { projectIds: [p.project_id], titles: [p.title] });
      }
    }
    const dupes: LintFinding[] = [];
    for (const [slug, info] of slugToProjects) {
      if (info.projectIds.length < 2) continue;
      if (!info.projectIds.includes(current)) continue;
      const others = info.projectIds.filter((id) => id !== current);
      dupes.push({
        kind: 'cross-project-duplicate',
        slug,
        title: info.titles[0] ?? slug,
        reason: `Slug \`${slug}\` exists in ${info.projectIds.length} projects (${info.projectIds.join(', ')}). If it's the same concept, bridge with \`[[<project>/${slug}]]\`. If it's an accidental collision, rename one.`,
        details: { projectIds: info.projectIds, otherProjectIds: others },
      });
    }
    dupes.sort((a, b) => a.slug.localeCompare(b.slug));
    findings.push(...dupes.slice(0, maxPerKind));
  }

  const byKind = {
    orphan: findings.filter((f) => f.kind === 'orphan').length,
    'missing-concept': findings.filter((f) => f.kind === 'missing-concept').length,
    'stale-page': findings.filter((f) => f.kind === 'stale-page').length,
    'cross-project-duplicate': findings.filter((f) => f.kind === 'cross-project-duplicate').length,
  };

  return {
    generated_at: new Date().toISOString(),
    total_pages_checked: pagesBySlug.size,
    findings,
    byKind,
  };
}
