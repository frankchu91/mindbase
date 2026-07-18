import { Router } from 'express';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerContext } from '../../context.js';
import { projectPaths } from '@mindbase/core';
import { projectRoot as makeProjectRoot, detectLayoutVersion } from '../../context.js';

async function listByUser(projectRoot: string): Promise<Record<string, Array<{ date: string; size: number; mtime: string }>>> {
  const p = projectPaths();
  const usersRoot = join(projectRoot, p.contributorsRoot);
  const result: Record<string, Array<{ date: string; size: number; mtime: string }>> = {};
  let users: string[] = [];
  try { users = await readdir(usersRoot); } catch { return result; }
  for (const user of users) {
    const userDir = join(usersRoot, user);
    let entries: string[] = [];
    try { entries = await readdir(userDir); } catch { continue; }
    const files: Array<{ date: string; size: number; mtime: string }> = [];
    for (const e of entries) {
      if (!e.endsWith('.md')) continue;
      const s = await stat(join(userDir, e));
      files.push({ date: e.replace(/\.md$/, ''), size: s.size, mtime: new Date(s.mtimeMs).toISOString() });
    }
    result[user] = files.sort((a, b) => (a.date > b.date ? -1 : 1));
  }
  return result;
}

async function listFlat(dir: string): Promise<Array<{ slug: string; size: number; mtime: string }>> {
  const out: Array<{ slug: string; size: number; mtime: string }> = [];
  let entries: string[] = [];
  try { entries = await readdir(dir); } catch { return out; }
  for (const e of entries) {
    if (!e.endsWith('.md')) continue;
    const s = await stat(join(dir, e));
    out.push({ slug: e.replace(/\.md$/, ''), size: s.size, mtime: new Date(s.mtimeMs).toISOString() });
  }
  return out.sort((a, b) => (a.mtime > b.mtime ? -1 : 1));
}

export function listRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const projectId = ctx.currentProjectId;
    const root = makeProjectRoot(ctx.dataDir, projectId);
    const layout = await detectLayoutVersion(root);
    if (layout === 'v1') {
      return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED', projectId });
    }
    const p = projectPaths();

    const [hasReadme, hasSoul, contextStat] = await Promise.all([
      stat(join(root, p.readme)).then(() => true).catch(() => false),
      stat(join(root, p.soul)).then(() => true).catch(() => false),
      stat(join(root, p.context)).then((s) => s).catch(() => null),
    ]);

    const contributors = await listByUser(root);
    const research = await listFlat(join(root, p.researchDir));
    const logs: string[] = [];
    try {
      for (const f of await readdir(join(root, p.logsRoot))) {
        if (f.endsWith('.md')) logs.push(f.replace(/\.md$/, ''));
      }
    } catch { /* ok */ }
    const raw: string[] = [];
    try { raw.push(...(await readdir(join(root, p.rawDir)))); } catch { /* ok */ }
    const artifacts: string[] = [];
    try { artifacts.push(...(await readdir(join(root, p.artifactsRoot)))); } catch { /* ok */ }

    const contributorCount = Object.values(contributors).reduce((a, v) => a + v.length, 0);

    return res.json({
      project: projectId,
      categories: [
        { id: 'readme', hasFile: hasReadme },
        {
          id: 'context',
          hasFile: !!contextStat,
          lastBuilt: contextStat ? new Date(contextStat.mtimeMs).toISOString() : null,
          unbuiltSourcesCount: 0,
        },
        { id: 'soul', hasFile: hasSoul },
        {
          id: 'contributors',
          count: contributorCount,
          users: Object.entries(contributors).map(([name, files]) => ({
            name,
            count: files.length,
            latest: files[0]?.date ?? null,
          })),
        },
        { id: 'research', count: research.length },
        { id: 'raw', count: raw.length },
        { id: 'logs', count: logs.length },
        { id: 'artifacts', count: artifacts.length },
      ],
    });
  });

  router.get('/:category', async (req, res) => {
    const category = req.params.category as string;
    const projectId = ctx.currentProjectId;
    const root = makeProjectRoot(ctx.dataDir, projectId);
    const layout = await detectLayoutVersion(root);
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED', projectId });
    const p = projectPaths();

    if (category === 'contributors') {
      const users = await listByUser(root);
      return res.json({ category: 'contributors', users });
    }
    if (category === 'research') {
      const files = await listFlat(join(root, p.researchDir));
      return res.json({ category: 'research', files });
    }
    if (category === 'logs') {
      const days: string[] = [];
      try {
        for (const f of await readdir(join(root, p.logsRoot))) {
          if (f.endsWith('.md')) days.push(f.replace(/\.md$/, ''));
        }
      } catch { /* ok */ }
      days.sort().reverse();
      return res.json({ category: 'logs', days });
    }
    if (category === 'raw') {
      const entries: Array<{ date: string; id: string }> = [];
      try {
        const dates = await readdir(join(root, p.rawDir));
        for (const date of dates) {
          try {
            const ids = await readdir(join(root, p.rawDir, date));
            for (const id of ids) entries.push({ date, id });
          } catch { /* skip */ }
        }
      } catch { /* ok */ }
      return res.json({ category: 'raw', entries });
    }
    if (category === 'artifacts') {
      const files = await listFlat(join(root, p.artifactsRoot));
      return res.json({ category: 'artifacts', files });
    }
    if (['readme', 'context', 'soul'].includes(category)) {
      const path = category === 'readme' ? p.readme : category === 'context' ? p.context : p.soul;
      const body = await readFile(join(root, path), 'utf-8').catch(() => null);
      return res.json({ category, body });
    }
    return res.status(404).json({ error: 'Unknown category', category });
  });

  return router;
}
