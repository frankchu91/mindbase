// apps/server/src/routes/server.ts
//
// Server-level preferences that can't live inside the data dir (chicken-and-
// egg). Today: the active data directory. Future: launcher-level prefs.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Router } from 'express';
import { resolveDataDirAsync, serverPrefsPath, writeServerPrefs } from '../config';
import type { ServerContext } from '../context';

interface DataDirInfo {
  current: string;
  source: 'env' | 'prefs' | 'default';
  envOverride: boolean;
  prefsPath: string;
  pendingRestart: boolean;
}

async function readPrefs(): Promise<{ dataDir?: string }> {
  try {
    const text = await fs.readFile(serverPrefsPath(), 'utf-8');
    const parsed = JSON.parse(text) as { dataDir?: string };
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function serverRoutes(ctx: ServerContext): Router {
  const router = Router();

  // GET /api/server/data-dir
  router.get('/data-dir', async (_req, res) => {
    try {
      const envOverride = !!process.env['MINDBASE_DATA_DIR'];
      const prefs = await readPrefs();
      const resolved = await resolveDataDirAsync();
      const source: DataDirInfo['source'] = envOverride
        ? 'env'
        : prefs.dataDir
          ? 'prefs'
          : 'default';
      // Pending restart if the resolved-at-boot path differs from current resolution.
      const pendingRestart = resolved !== ctx.dataDir;
      res.json({
        current: ctx.dataDir,
        source,
        envOverride,
        prefsPath: serverPrefsPath(),
        pendingRestart,
      } satisfies DataDirInfo);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // PUT /api/server/data-dir
  router.put('/data-dir', async (req, res) => {
    try {
      const body = req.body as { dataDir?: unknown };
      if (typeof body.dataDir !== 'string' || body.dataDir.trim().length === 0) {
        res.status(400).json({ error: 'dataDir (string) required' });
        return;
      }
      if (process.env['MINDBASE_DATA_DIR']) {
        res.status(409).json({
          error:
            'MINDBASE_DATA_DIR env var is set — UI cannot override. Unset the env var first.',
        });
        return;
      }
      const expanded = expandHome(body.dataDir.trim());
      const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(expanded);

      // Validate: parent must exist (we will mkdir the target ourselves).
      const parent = path.dirname(absolute);
      try {
        const parentStat = await fs.stat(parent);
        if (!parentStat.isDirectory()) {
          res.status(400).json({ error: `parent is not a directory: ${parent}` });
          return;
        }
      } catch {
        res.status(400).json({ error: `parent directory does not exist: ${parent}` });
        return;
      }
      // Probe write access — try creating + removing a sentinel file.
      await fs.mkdir(absolute, { recursive: true });
      const sentinel = path.join(absolute, '.mb-write-probe');
      try {
        await fs.writeFile(sentinel, '');
        await fs.unlink(sentinel);
      } catch {
        res.status(400).json({ error: `directory is not writable: ${absolute}` });
        return;
      }

      await writeServerPrefs({ dataDir: absolute });
      res.json({
        ok: true,
        dataDir: absolute,
        pendingRestart: absolute !== ctx.dataDir,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
