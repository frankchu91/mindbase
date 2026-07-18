// apps/server/src/routes/projects.ts
import { Router } from 'express';
import {
  createProject,
  getProject,
  isValidProjectId,
  listProjects,
  parseLog,
  projectPaths,
} from '@mindbase/core';
import type { ProjectMeta } from '@mindbase/core';
import { readdir, stat } from 'node:fs/promises';
import { join as pathJoin } from 'node:path';
import type { ServerContext } from '../context';
import { detectLayoutVersion, projectRoot } from '../context';

/**
 * Translate a legacy v1 path (e.g., "wiki/notes/<slug>.md") to v2 if the
 * project has been migrated; otherwise return v1 path unchanged.
 *
 * v1: wiki/notes/<slug>.md, wiki/sources/<slug>.md, wiki/INDEX.md, wiki/log.md
 * v2: sources/contributors/<user>/<slug>.md, sources/research/<slug>.md, context.md, logs/
 */
async function resolveWikiPath(dataDir: string, projectId: string, legacyPath: string, user: string = 'default'): Promise<string> {
  const root = projectRoot(dataDir, projectId);
  const layout = await detectLayoutVersion(root);
  if (layout === 'v1') return legacyPath;
  const p = projectPaths();
  if (legacyPath.startsWith('wiki/notes/')) {
    const slug = legacyPath.replace(/^wiki\/notes\//, '').replace(/\.md$/, '');
    return p.contributorDay(user, slug);
  }
  if (legacyPath.startsWith('wiki/sources/')) {
    const slug = legacyPath.replace(/^wiki\/sources\//, '').replace(/\.md$/, '');
    return p.researchFile(slug);
  }
  if (legacyPath === 'wiki/INDEX.md') return p.context;
  if (legacyPath === 'wiki/schema.md') return p.readme;
  if (legacyPath === 'wiki/log.md') return p.logsRoot;
  return legacyPath;
}

const VALID_TEMPLATES = new Set<ProjectMeta['template']>([
  'literature-review',
  'market-research',
  'investigation',
  'reading-companion',
  'topic-tracker',
]);

function isValidTemplate(t: unknown): t is ProjectMeta['template'] {
  return typeof t === 'string' && VALID_TEMPLATES.has(t as ProjectMeta['template']);
}

export function projectsRoutes(ctx: ServerContext): Router {
  const router = Router();

  // List all projects (uses the unscoped store via ctx.rawStore)
  router.get('/', async (_req, res) => {
    try {
      const projects = await listProjects(ctx.rawStore);
      res.json({ projects, currentProjectId: ctx.currentProjectId });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Create a new project
  router.post('/', async (req, res) => {
    try {
      const { name, template } = req.body as { name?: string; template?: unknown };
      if (!name?.trim()) {
        res.status(400).json({ error: 'name required' });
        return;
      }
      const meta = await createProject(ctx.rawStore, {
        name,
        ...(isValidTemplate(template) ? { template } : {}),
      });
      res.json(meta);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Switch current project — updates ctx + persists to config.json
  router.post('/switch', async (req, res) => {
    try {
      const { id } = req.body as { id?: unknown };
      if (typeof id !== 'string' || !isValidProjectId(id)) {
        res.status(400).json({ error: 'invalid id' });
        return;
      }
      const target = await getProject(ctx.rawStore, id);
      if (!target) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      await ctx.switchProject(id);
      res.json({ ok: true, currentProjectId: id });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/projects/log — parsed entries from wiki/log.md
  router.get('/log', async (_req, res) => {
    try {
      const logPath = await resolveWikiPath(ctx.dataDir, ctx.currentProjectId, 'wiki/log.md');
      const body = await ctx.store.readText(logPath).catch(() => '');
      res.json({ entries: parseLog(body) });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/projects/:id — single-project metadata with layout-aware fields.
  // MUST come AFTER literal routes like `/log` and `/switch`.
  router.get('/:id', async (req, res) => {
    try {
      const id = req.params['id']!;
      if (!isValidProjectId(id)) {
        res.status(400).json({ error: 'invalid id' });
        return;
      }
      const meta = await getProject(ctx.rawStore, id);
      if (!meta) {
        res.status(404).json({ error: 'not found' });
        return;
      }

      // Additive enrichment: layoutVersion + lastBuild + contributorsCount.
      // These never throw — best-effort, defaults on failure.
      const root = projectRoot(ctx.dataDir, id);
      const layoutVersion = await detectLayoutVersion(root);

      let lastBuild: string | null = null;
      try {
        const ctxFile = layoutVersion === 'v2'
          ? pathJoin(root, projectPaths().context)
          : pathJoin(root, 'wiki', 'INDEX.md');
        const st = await stat(ctxFile);
        lastBuild = st.mtime.toISOString();
      } catch { /* never built */ }

      let contributorsCount = 0;
      try {
        if (layoutVersion === 'v2') {
          const contribDir = pathJoin(root, projectPaths().contributorsRoot);
          const entries = await readdir(contribDir, { withFileTypes: true });
          contributorsCount = entries.filter((e) => e.isDirectory()).length;
        }
      } catch { /* dir missing */ }

      res.json({ ...meta, layoutVersion, lastBuild, contributorsCount });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
