import BetterSqlite3 from 'better-sqlite3';

/**
 * Parse a wikilink target string into (project, slug). Qualified form
 * `proj/slug` resolves to (proj, slug); unqualified `slug` resolves to
 * (sourceProjectId, slug) — intra-project. A slug containing a slash but
 * not matching project-id rules is treated as unqualified to stay safe.
 */
function parseQualifiedTarget(
  target: string,
  sourceProjectId: string,
): { targetSlug: string; targetProjectId: string } {
  const slash = target.indexOf('/');
  if (slash <= 0 || slash === target.length - 1) {
    return { targetSlug: target, targetProjectId: sourceProjectId };
  }
  const projCandidate = target.slice(0, slash);
  const slugCandidate = target.slice(slash + 1);
  // Project ids are kebab-case, no further slashes in the slug part.
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(projCandidate) || slugCandidate.includes('/')) {
    return { targetSlug: target, targetProjectId: sourceProjectId };
  }
  return { targetSlug: slugCandidate, targetProjectId: projCandidate };
}

import { ensureSchema } from './schema';
import { diffLinks, type StoredLink } from './diff-links';
import { AuditLogWriter } from '../../compile/audit';
import { AnalysisCache, ContradictionCache } from '../../analysis/cache';
import type { CommunityResult } from '../../analysis/communities';
import type { ClassifiedLink } from './classify-edges';
import type { EdgeType } from './edge-type';
import type { LinkConfidence } from './extract-links';
import type { EdgeConfidence, PageEdge, PageGraph, PageNode } from '../types';
import type { Visibility, WikiFileType } from '../../types';

export interface PageUpsert {
  slug: string;
  path: string;
  title: string;
  type: string;
  kind: string | null;
  contentHash: string;
  wordCount: number;
  tags: string[];
  visibility: string | null;
  /** Legacy page-level tag — a freeform property, NOT the owning project id. */
  project: string | null;
  /**
   * Owning project's directory id (e.g. 'default', 'lotr'). Drives the
   * unified graph. Optional for back-compat with single-project callers /
   * tests — omitted means 'default'.
   */
  projectId?: string;
  summary: string | null;
  meta: Record<string, unknown> | null;
}

export interface PageRow {
  slug: string;
  path: string;
  title: string;
  type: string;
  kind: string | null;
  content_hash: string;
  word_count: number;
  inbound_count: number;
  outbound_count: number;
  tags: string[];
  visibility: string | null;
  project: string | null;
  project_id: string;
  summary: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  community_id: number | null;
}

export interface LinkRow {
  id: number;
  source_slug: string;
  target_slug: string;
  edge_type: string;
  confidence: LinkConfidence;
  inference_rule: string | null;
  context_snippet: string | null;
  source_location: string | null;
  origin: string;
  source_project_id: string;
  /** NULL = intra-project (target lives in same project as source). */
  target_project_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PageRawRow {
  slug: string;
  path: string;
  title: string;
  type: string;
  kind: string | null;
  content_hash: string;
  word_count: number;
  inbound_count: number;
  outbound_count: number;
  tags: string | null;          // JSON string
  visibility: string | null;
  project: string | null;
  project_id: string;
  summary: string | null;
  meta: string | null;          // JSON string
  created_at: string;
  updated_at: string;
  community_id: number | null;
}

function parsePageRow(r: PageRawRow): PageRow {
  return {
    ...r,
    tags: r.tags ? (JSON.parse(r.tags) as string[]) : [],
    meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null,
  };
}

export class WikiIndex {
  private _analysisCache?: AnalysisCache;
  private _contradictionCache?: ContradictionCache;

  private constructor(private db: BetterSqlite3.Database) {
    ensureSchema(db);
  }

  static open(filePath: string): WikiIndex {
    return new WikiIndex(new BetterSqlite3(filePath));
  }

  static openInMemory(): WikiIndex {
    return new WikiIndex(new BetterSqlite3(':memory:'));
  }

  close(): void {
    this.db.close();
  }

  /**
   * Upsert a page row + reconcile its outgoing links against `links`.
   * Atomic: pages row + link diff happen in one transaction.
   * Maintains denormalized inbound_count / outbound_count for affected nodes.
   */
  upsertPage(page: PageUpsert, links: ClassifiedLink[]): void {
    const now = new Date().toISOString();
    const txn = this.db.transaction(() => {
      // 1. Upsert pages row. Conflict target is the composite
      //    (project_id, slug) so two projects can each own a page named
      //    "harper-insurance" without one wiping the other.
      this.db.prepare(`
        INSERT INTO pages (
          slug, path, title, type, kind, content_hash, word_count,
          tags, visibility, project, project_id, summary, meta, created_at, updated_at
        ) VALUES (
          @slug, @path, @title, @type, @kind, @contentHash, @wordCount,
          @tags, @visibility, @project, @projectId, @summary, @meta, @now, @now
        )
        ON CONFLICT(project_id, slug) DO UPDATE SET
          path = excluded.path,
          title = excluded.title,
          type = excluded.type,
          kind = excluded.kind,
          content_hash = excluded.content_hash,
          word_count = excluded.word_count,
          tags = excluded.tags,
          visibility = excluded.visibility,
          project = excluded.project,
          summary = excluded.summary,
          meta = excluded.meta,
          updated_at = excluded.updated_at
      `).run({
        slug: page.slug,
        path: page.path,
        title: page.title,
        type: page.type,
        kind: page.kind,
        contentHash: page.contentHash,
        wordCount: page.wordCount,
        tags: JSON.stringify(page.tags),
        visibility: page.visibility,
        project: page.project,
        projectId: (page.projectId ?? 'default'),
        summary: page.summary,
        meta: page.meta ? JSON.stringify(page.meta) : null,
        now,
      });

      // 2. Diff links: load current outgoing FOR THIS PROJECT, compute
      //    insert/delete/update. Filtering by source_project_id is essential
      //    in the unified-graph model: two projects might each define their
      //    own [[same-slug]] without colliding.
      const prevRows = this.db.prepare(
        `SELECT target_slug as target, edge_type as edgeType, confidence, inference_rule as inferenceRule,
                target_project_id as targetProjectId
   FROM links WHERE source_slug = ? AND source_project_id = ? AND origin = 'markdown'`
      ).all(page.slug, (page.projectId ?? 'default')) as Array<{ target: string; edgeType: EdgeType; confidence: LinkConfidence; inferenceRule: string | null; targetProjectId: string | null }>;
      const prev: StoredLink[] = prevRows.map((r) => ({
        target: r.target,
        edgeType: r.edgeType,
        confidence: r.confidence,
        inferenceRule: r.inferenceRule,
      }));
      const diff = diffLinks(prev, links);

      // 3. Apply diff. All link writes are scoped by source_project_id so two
      //    projects can each have their own [[same-slug]] edge.
      if (diff.toDelete.length > 0) {
        const stmt = this.db.prepare(
          `DELETE FROM links WHERE source_slug = ? AND source_project_id = ? AND target_slug = ? AND origin = 'markdown'`
        );
        for (const l of diff.toDelete) stmt.run(page.slug, (page.projectId ?? 'default'), l.target);
      }
      for (const l of diff.toInsert) {
        // Resolve qualified `proj/slug` target. NULL target_project_id means
        // intra-project (target lives in source's project).
        const { targetSlug, targetProjectId } = parseQualifiedTarget(l.target, (page.projectId ?? 'default'));
        this.db.prepare(`
          INSERT INTO links (
            source_slug, target_slug, edge_type, confidence, inference_rule,
            context_snippet, origin, source_project_id, target_project_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'markdown', ?, ?, ?, ?)
        `).run(
          page.slug, targetSlug, l.edgeType, l.confidence, l.inferenceRule,
          l.contextSnippet ?? null, (page.projectId ?? 'default'),
          targetProjectId === (page.projectId ?? 'default') ? null : targetProjectId,
          now, now,
        );
      }
      for (const l of diff.toUpdate) {
        this.db.prepare(`
          UPDATE links SET edge_type = ?, confidence = ?, inference_rule = ?,
                           context_snippet = ?, updated_at = ?
          WHERE source_slug = ? AND source_project_id = ? AND target_slug = ? AND origin = 'markdown'
        `).run(l.edgeType, l.confidence, l.inferenceRule, l.contextSnippet ?? null, now, page.slug, (page.projectId ?? 'default'), l.target);
      }

      // 4. Recompute outbound_count for this page.
      this.db.prepare(`
        UPDATE pages SET outbound_count = (
          SELECT COUNT(*) FROM links WHERE source_slug = ? AND source_project_id = ?
        ) WHERE slug = ? AND project_id = ?
      `).run(page.slug, (page.projectId ?? 'default'), page.slug, (page.projectId ?? 'default'));

      // 5. Recompute inbound_count for affected targets.
      const affected = new Set<string>();
      for (const l of diff.toInsert) affected.add(l.target);
      for (const l of diff.toDelete) affected.add(l.target);
      const updateInbound = this.db.prepare(`
        UPDATE pages SET inbound_count = (
          SELECT COUNT(*) FROM links WHERE target_slug = ?
        ) WHERE slug = ?
      `);
      for (const slug of affected) updateInbound.run(slug, slug);
    });
    txn();
  }

  /**
   * Persist a typed edge between two existing pages. Idempotent — the
   * UNIQUE (source_slug, target_slug, edge_type, origin) constraint dedupes
   * via ON CONFLICT REPLACE (from v1 schema).
   *
   * Origin is set to 'llm' to distinguish from markdown-derived edges.
   */
  insertLink(args: {
    from: string;
    to: string;
    edgeType: string;
    reason?: string;
    sourceProjectId?: string;
    targetProjectId?: string;
  }): void {
    const now = new Date().toISOString();
    const sourceProjectId = args.sourceProjectId ?? 'default';
    // If caller didn't specify, parse `proj/slug` form on `to`, then fall back
    // to source's project for intra-project edges.
    const parsed = parseQualifiedTarget(args.to, sourceProjectId);
    const targetSlug = args.targetProjectId ? args.to : parsed.targetSlug;
    const targetProjectId = args.targetProjectId ?? parsed.targetProjectId;

    this.db.prepare(`
      INSERT INTO links (
        source_slug, target_slug, edge_type, confidence, inference_rule,
        context_snippet, origin, source_project_id, target_project_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'llm', ?, ?, ?, ?)
    `).run(
      args.from, targetSlug, args.edgeType, 'inferred', args.reason ?? null,
      null, sourceProjectId,
      targetProjectId === sourceProjectId ? null : targetProjectId,
      now, now,
    );

    // Recompute inbound_count for the target (in target's project).
    this.db.prepare(`
      UPDATE pages SET inbound_count = (
        SELECT COUNT(*) FROM links WHERE target_slug = ?
      ) WHERE slug = ? AND project_id = ?
    `).run(targetSlug, targetSlug, targetProjectId);

    // Recompute outbound_count for the source.
    this.db.prepare(`
      UPDATE pages SET outbound_count = (
        SELECT COUNT(*) FROM links WHERE source_slug = ? AND source_project_id = ?
      ) WHERE slug = ? AND project_id = ?
    `).run(args.from, sourceProjectId, args.from, sourceProjectId);
  }

  deletePage(slug: string): void {
    const txn = this.db.transaction(() => {
      // Collect outbound targets so we can recompute their inbound_count.
      const affected = (this.db.prepare(
        `SELECT DISTINCT target_slug FROM links WHERE source_slug = ?`
      ).all(slug) as Array<{ target_slug: string }>).map((r) => r.target_slug);

      this.db.prepare(`DELETE FROM links WHERE source_slug = ?`).run(slug);
      this.db.prepare(`DELETE FROM links WHERE target_slug = ?`).run(slug);
      this.db.prepare(`DELETE FROM pages WHERE slug = ?`).run(slug);

      const updateInbound = this.db.prepare(`
        UPDATE pages SET inbound_count = (
          SELECT COUNT(*) FROM links WHERE target_slug = ?
        ) WHERE slug = ?
      `);
      for (const target of affected) updateInbound.run(target, target);
    });
    txn();
  }

  /**
   * Rename a page: update pages.slug + path, rewrite all links that
   * source-from or target-at the old slug.
   */
  renamePage(oldSlug: string, newSlug: string, newPath: string): void {
    const now = new Date().toISOString();
    const txn = this.db.transaction(() => {
      this.db.prepare(
        `UPDATE pages SET slug = ?, path = ?, updated_at = ? WHERE slug = ?`
      ).run(newSlug, newPath, now, oldSlug);
      this.db.prepare(
        `UPDATE links SET source_slug = ?, updated_at = ? WHERE source_slug = ?`
      ).run(newSlug, now, oldSlug);
      this.db.prepare(
        `UPDATE links SET target_slug = ?, updated_at = ? WHERE target_slug = ?`
      ).run(newSlug, now, oldSlug);
    });
    txn();
  }

  getPage(slug: string): PageRow | null {
    const row = this.db.prepare(`SELECT * FROM pages WHERE slug = ?`).get(slug) as PageRawRow | undefined;
    return row ? parsePageRow(row) : null;
  }

  allPages(): PageRow[] {
    const rows = this.db.prepare(`SELECT * FROM pages ORDER BY slug`).all() as PageRawRow[];
    return rows.map(parsePageRow);
  }

  allLinks(): LinkRow[] {
    return this.db.prepare(`SELECT * FROM links ORDER BY id`).all() as LinkRow[];
  }

  /**
   * Returns an AuditLogWriter bound to this index's database. The writer
   * shares the same connection so audit writes participate in the same
   * file/WAL as the page+link data.
   */
  auditLog(): AuditLogWriter {
    return new AuditLogWriter(this.db);
  }

  /**
   * Returns an AnalysisCache bound to this index's database. Memoized so
   * prepared statements are compiled once and reused.
   */
  analysisCache(): AnalysisCache {
    if (!this._analysisCache) this._analysisCache = new AnalysisCache(this.db);
    return this._analysisCache;
  }

  /**
   * Returns a ContradictionCache bound to this index's database. Memoized so
   * prepared statements are compiled once and reused.
   */
  contradictionCache(): ContradictionCache {
    if (!this._contradictionCache) this._contradictionCache = new ContradictionCache(this.db);
    return this._contradictionCache;
  }

  /**
   * Returns true iff at least one row in `links` still has the Phase-1
   * default state (edge_type='mentions' AND inference_rule IS NULL). Used
   * by the server to detect "this index predates Phase 2, run backfill."
   */
  hasUntypedLinks(): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM links WHERE edge_type = 'mentions' AND inference_rule IS NULL LIMIT 1
    `).get();
    return row !== undefined;
  }

  outgoingFrom(slug: string): LinkRow[] {
    return this.db.prepare(
      `SELECT * FROM links WHERE source_slug = ? ORDER BY id`
    ).all(slug) as LinkRow[];
  }

  incomingTo(slug: string): LinkRow[] {
    return this.db.prepare(
      `SELECT * FROM links WHERE target_slug = ? ORDER BY id`
    ).all(slug) as LinkRow[];
  }

  /**
   * Persist community detection output: update each page's community_id and
   * rewrite the `communities` table summary rows. Atomic.
   *
   * Pages absent from the new assignment are reset to NULL first so no page
   * retains a stale community_id pointing at a deleted communities row.
   */
  applyCommunityAssignments(result: CommunityResult): void {
    const now = new Date().toISOString();
    const clearAllAssignments = this.db.prepare(`UPDATE pages SET community_id = NULL`);
    const updatePage = this.db.prepare(`UPDATE pages SET community_id = ? WHERE slug = ?`);
    const clearCommunities = this.db.prepare(`DELETE FROM communities`);
    const insertCommunity = this.db.prepare(
      `INSERT INTO communities (id, label, size, computed_at) VALUES (?, ?, ?, ?)`,
    );
    const txn = this.db.transaction(() => {
      clearAllAssignments.run();
      for (const [slug, id] of result.assignments) updatePage.run(id, slug);
      clearCommunities.run();
      for (const summary of result.summaries) insertCommunity.run(summary.id, summary.label, summary.size, now);
    });
    txn();
  }

  /** Return all community summary rows. Mirrors what's written by applyCommunityAssignments. */
  listCommunities(): Array<{ id: number; size: number; label: string | null; computed_at: string }> {
    return this.db.prepare(
      `SELECT id, size, label, computed_at FROM communities ORDER BY size DESC, id ASC`,
    ).all() as Array<{ id: number; size: number; label: string | null; computed_at: string }>;
  }

  /**
   * Materialize the in-memory PageGraph shape that legacy callers expect.
   * Same output as the old buildGraph(store), but assembled from index
   * rows instead of by scanning files.
   */
  /**
   * Build a graph view.
   * - No opts → unscoped, every page from every project (used for
   *   cross-project synthesis, lint --all-projects).
   * - `{ projectId }` → primary nodes = pages of that project, edges = those
   *   sourced from that project (intra + outgoing cross-project). For each
   *   cross-project edge the target page is included as a lightweight
   *   `crossProjectStub` node so the UI can render the other side.
   */
  buildGraph(opts: { projectId?: string } = {}): PageGraph {
    const pages = this.allPages();
    const links = this.allLinks();
    const filterProject = opts.projectId;

    // In unified mode (no project filter), node ids must be qualified
    // `<projectId>/<slug>` so two projects with the same slug don't collide.
    // In single-project mode (filter set), plain slugs are unambiguous and
    // the back-compat UI contract still holds.
    const qualify = (projectId: string, slug: string): string =>
      filterProject ? slug : `${projectId}/${slug}`;

    const nodes = new Map<string, PageNode>();
    const byProjectSlug = new Map<string, PageRow>();
    for (const p of pages) byProjectSlug.set(`${p.project_id}/${p.slug}`, p);

    for (const p of pages) {
      if (filterProject && p.project_id !== filterProject) continue;
      const id = qualify(p.project_id, p.slug);
      nodes.set(id, {
        slug: p.slug,
        path: p.path,
        title: p.title,
        type: p.type as WikiFileType,
        tags: p.tags,
        category: inferCategory(p.slug, p.type),
        visibility: (p.visibility as Visibility | undefined) ?? undefined,
        project: p.project ?? undefined,
        projectId: p.project_id,
        wordCount: p.word_count,
        summary: p.summary ?? undefined,
        kind: p.kind ?? undefined,
        community_id: p.community_id,
      });
    }

    const edges: PageEdge[] = [];
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();
    for (const l of links) {
      if (filterProject && l.source_project_id !== filterProject) continue;
      const targetProjectId = l.target_project_id ?? l.source_project_id;
      const crossProject = targetProjectId !== l.source_project_id;
      const sourceId = qualify(l.source_project_id, l.source_slug);
      const targetId = qualify(targetProjectId, l.target_slug);

      // Add a stub for cross-project targets in single-project view.
      if (filterProject && crossProject && !nodes.has(targetId)) {
        const targetPage = byProjectSlug.get(`${targetProjectId}/${l.target_slug}`);
        if (targetPage) {
          nodes.set(targetId, {
            slug: targetPage.slug,
            path: targetPage.path,
            title: targetPage.title,
            type: targetPage.type as WikiFileType,
            tags: targetPage.tags,
            category: inferCategory(targetPage.slug, targetPage.type),
            visibility: (targetPage.visibility as Visibility | undefined) ?? undefined,
            projectId: targetProjectId,
            crossProjectStub: true,
            wordCount: targetPage.word_count,
            summary: targetPage.summary ?? undefined,
            kind: targetPage.kind ?? undefined,
            community_id: targetPage.community_id,
          });
        }
      }

      const broken = !nodes.has(targetId);
      edges.push({
        source: sourceId,
        target: targetId,
        confidence: l.confidence as EdgeConfidence,
        broken,
        edgeType: l.edge_type as EdgeType,
        inferenceRule: l.inference_rule,
        crossProject,
        sourceProjectId: l.source_project_id,
        targetProjectId,
      });
      const outArr = outgoing.get(sourceId) ?? [];
      outArr.push(targetId);
      outgoing.set(sourceId, outArr);
      if (!broken) {
        const inArr = incoming.get(targetId) ?? [];
        inArr.push(sourceId);
        incoming.set(targetId, inArr);
      }
    }
    return { nodes, edges, incoming, outgoing };
  }
}

function inferCategory(slug: string, type: string): string {
  if (slug.startsWith('entities/')) return 'entities';
  if (slug.startsWith('concepts/')) return 'concepts';
  if (slug.startsWith('skills/')) return 'skills';
  return type === 'concept' ? 'concepts' : type;
}
