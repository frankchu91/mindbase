import { Router } from 'express';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ServerContext } from '../../context.js';
import { projectPaths } from '@mindbase/core';
import { projectRoot as makeProjectRoot, detectLayoutVersion } from '../../context.js';

const KNOWN_TEMPLATES = ['empty', 'investigation', 'literature-review', 'market-research', 'reading-companion', 'topic-tracker'];

export function templateTreeRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.post('/template/:tid', async (req, res) => {
    const tid = req.params.tid;
    if (!KNOWN_TEMPLATES.includes(tid)) return res.status(400).json({ error: 'Unknown template', tid });
    if (tid === 'empty') return res.json({ tid, applied: false, noop: true });

    const projectId = ctx.currentProjectId;
    const layout = await detectLayoutVersion(makeProjectRoot(ctx.dataDir, projectId));
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED' });

    const p = projectPaths();
    const projRoot = join(ctx.dataDir, 'projects', projectId);

    // Templates live in apps/plugin/templates/schema-templates/
    // Try MINDBASE_PLUGIN_ROOT env var, then relative-to-cwd fallback.
    const pluginRoot = process.env['MINDBASE_PLUGIN_ROOT'] ?? resolve(process.cwd(), 'apps', 'plugin');
    const tplPath = join(pluginRoot, 'templates', 'schema-templates', `${tid}.md.template`);

    let tplBody = '';
    try { tplBody = await readFile(tplPath, 'utf-8'); }
    catch (e) { return res.status(500).json({ error: `Template not found at ${tplPath}: ${(e as Error).message}` }); }

    const readmePath = join(projRoot, p.readme);
    const readme = await readFile(readmePath, 'utf-8').catch(() => '');
    if (readme.includes(`<!-- TEMPLATE: ${tid} -->`)) return res.json({ tid, alreadyApplied: true });
    await writeFile(readmePath, `${readme}\n\n<!-- TEMPLATE: ${tid} -->\n\n${tplBody}\n`, 'utf-8');
    return res.json({ tid, applied: true });
  });

  return router;
}
