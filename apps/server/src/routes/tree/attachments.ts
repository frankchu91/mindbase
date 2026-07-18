import { Router } from 'express';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ServerContext } from '../../context.js';
import { projectRoot as makeProjectRoot, detectLayoutVersion } from '../../context.js';
import { sha256 } from '../../lib/hash.js';

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

function contentTypeFor(filename: string): string {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

export function attachmentsTreeRoutes(ctx: ServerContext): Router {
  const router = Router();

  // POST /attachments/upload — body { data: base64, mime }. Returns { url, filename }.
  router.post('/attachments/upload', async (req, res) => {
    const projectId = ctx.currentProjectId;
    const layout = await detectLayoutVersion(makeProjectRoot(ctx.dataDir, projectId));
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED' });
    const b64 = req.body?.data as string | undefined;
    const mime = (req.body?.mime as string | undefined) ?? 'application/octet-stream';
    if (!b64) return res.status(400).json({ error: 'data (base64) required' });
    const data = Buffer.from(b64, 'base64');
    const ext = MIME_TO_EXT[mime] ?? (mime.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '');
    const filename = `${sha256(b64).slice(0, 16)}.${ext}`;
    const abs = join(ctx.dataDir, 'projects', projectId, 'artifacts', 'attachments', filename);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, data);
    return res.json({ url: `/api/tree/attachments/${filename}`, filename });
  });

  // GET /attachments/:filename — read binary from artifacts/attachments/.
  router.get('/attachments/:filename', async (req, res) => {
    const projectId = ctx.currentProjectId;
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return res.status(400).json({ error: 'Invalid filename' });
    const abs = join(ctx.dataDir, 'projects', projectId, 'artifacts', 'attachments', filename);
    try {
      const buf = await readFile(abs);
      return res.type(contentTypeFor(filename)).send(buf);
    } catch { return res.status(404).json({ error: 'Not found' }); }
  });

  return router;
}
