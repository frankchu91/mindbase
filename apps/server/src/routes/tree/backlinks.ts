import { Router, type Request } from 'express';
import type { ServerContext } from '../../context.js';
import { isPathSafe, resolveTreePath, type TreeCategory, TREE_CATEGORIES } from '../../lib/tree-paths.js';
import { resolveUser } from '../../lib/user-attribution.js';

const KNOWN = new Set<string>(TREE_CATEGORIES);

/**
 * Derive the wiki-page slug used by WikiIndex from a category + relative path.
 * WikiIndex slugs correspond to the file's identifier (typically the filename
 * without `.md`); we strip that extension and use the disk-relative path.
 */
function toSlug(category: TreeCategory, relPath: string, user: string): string {
  const disk = resolveTreePath(category, relPath, user);
  return disk.replace(/\.md$/i, '');
}

/**
 * Express 4 does not support `:category/*path` — use a regex route to capture
 * the category, wildcard middle, and the trailing `backlinks|typed-links`
 * segment in one shot. Groups: 1=category, 2=relPath, 3=suffix.
 */
const ROUTE_RE = /^\/([^/]+)\/(.+)\/(backlinks|typed-links)$/;

export function backlinksTreeRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get(ROUTE_RE, async (req: Request, res) => {
    const params = req.params as unknown as Record<string, string>;
    const category = params[0] ?? '';
    const relPath = params[1] ?? '';
    const suffix = params[2] ?? '';
    if (!KNOWN.has(category)) return res.status(404).json({ error: 'Unknown category', category });
    if (!isPathSafe(relPath)) return res.status(400).json({ error: 'Invalid path' });

    const user = resolveUser(req);
    const slug = toSlug(category as TreeCategory, relPath, user);

    if (suffix === 'backlinks') {
      // Untyped backlinks = every incoming edge, projected to { from, edgeType }.
      const rows = ctx.wikiIndex.incomingTo(slug);
      const backlinks = rows.map((r) => ({
        from: r.source_slug,
        edgeType: r.edge_type,
        confidence: r.confidence,
        sourceProjectId: r.source_project_id,
      }));
      return res.json({ slug, backlinks });
    }

    // typed-links = outgoing edges grouped by edge_type.
    const rows = ctx.wikiIndex.outgoingFrom(slug);
    const links = rows.map((r) => ({
      to: r.target_slug,
      edgeType: r.edge_type,
      confidence: r.confidence,
      targetProjectId: r.target_project_id,
    }));
    return res.json({ slug, links });
  });

  return router;
}
