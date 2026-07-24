import { Router } from 'express';
import { createReadStream } from 'node:fs';
import { readdir as readdirP, readFile as readFileP, stat as statP, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerContext } from '../../context.js';
import { projectPaths, isoToday } from '@mindbase/core';
import { projectRoot as makeProjectRoot, detectLayoutVersion } from '../../context.js';
import { BINARY_EXTS } from '../../lib/binary-probe.js';
import { extractPdfText } from '../../lib/extract-pdf.js';

const UPLOAD_EXTS = new Set(['pdf', 'md', 'txt']);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function sanitizeBase(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'file';
}

async function pathExists(p: string): Promise<boolean> {
  try { await statP(p); return true; } catch { return false; }
}

export function rawTreeRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/raw', async (_req, res) => {
    const projectId = ctx.currentProjectId;
    const layout = await detectLayoutVersion(makeProjectRoot(ctx.dataDir, projectId));
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED' });
    const p = projectPaths();
    const root = join(ctx.dataDir, 'projects', projectId, p.rawDir);
    const entries: Array<{ date: string; id: string; size: number; kind: string }> = [];
    try {
      const dates = await readdirP(root);
      for (const date of dates) {
        try {
          const files = await readdirP(join(root, date));
          for (const id of files) {
            // Sidecars are served through their parent entry, not listed.
            if (id.endsWith('.extracted.md')) continue;
            const s = await statP(join(root, date, id));
            const ext = (id.split('.').pop() ?? '').toLowerCase();
            entries.push({ date, id, size: s.size, kind: (BINARY_EXTS as readonly string[]).includes(ext) ? 'binary' : 'text' });
          }
        } catch { /* skip */ }
      }
    } catch { /* ok */ }
    return res.json({ category: 'raw', entries });
  });

  // POST /raw/upload — body { data: base64, filename }. Archives the file
  // into sources/raw/<today>/, extracts text for PDFs, writes an
  // .extracted.md sidecar. Mirrors the MCP mindbase_ingest_file tool.
  router.post('/raw/upload', async (req, res) => {
    const projectId = ctx.currentProjectId;
    const layout = await detectLayoutVersion(makeProjectRoot(ctx.dataDir, projectId));
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED' });

    const b64 = req.body?.data as string | undefined;
    const filename = req.body?.filename as string | undefined;
    if (!b64 || !filename) return res.status(400).json({ error: 'data (base64) and filename required' });

    const ext = (filename.split('.').pop() ?? '').toLowerCase();
    if (!UPLOAD_EXTS.has(ext)) {
      return res.status(400).json({ error: `Unsupported extension '.${ext}'. Supported: .pdf, .md, .txt` });
    }
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: `File is ${(buf.length / 1024 / 1024).toFixed(1)}MB — the limit is 50MB` });
    }

    const p = projectPaths();
    const today = isoToday();
    const dirAbs = join(ctx.dataDir, 'projects', projectId, p.rawDir, today);
    await mkdir(dirAbs, { recursive: true });

    const base = sanitizeBase(filename.replace(/\.[^.]+$/, ''));
    let finalBase = base;
    for (let i = 2; await pathExists(join(dirAbs, `${finalBase}.${ext}`)); i++) {
      finalBase = `${base}-${i}`;
    }
    await writeFile(join(dirAbs, `${finalBase}.${ext}`), buf);

    let extractedChars = 0;
    if (ext === 'pdf') {
      try {
        const text = await extractPdfText(new Uint8Array(buf));
        extractedChars = text.length;
        await writeFile(join(dirAbs, `${finalBase}.extracted.md`), text, 'utf-8');
      } catch {
        // Archive succeeded; extraction is best-effort for the viewer.
      }
    } else {
      extractedChars = buf.length;
    }

    return res.json({ date: today, id: `${finalBase}.${ext}`, kind: ext === 'pdf' ? 'binary' : 'text', extractedChars });
  });

  router.get('/raw/:date/:id', async (req, res) => {
    const projectId = ctx.currentProjectId;
    const layout = await detectLayoutVersion(makeProjectRoot(ctx.dataDir, projectId));
    if (layout === 'v1') return res.status(409).json({ error: 'V1_LAYOUT_UNSUPPORTED' });
    const p = projectPaths();
    const dirAbs = join(ctx.dataDir, 'projects', projectId, p.rawDir, req.params.date);
    const abs = join(dirAbs, req.params.id);
    try {
      // Binary formats (e.g. PDFs) read as utf-8 are garbage — prefer the
      // .extracted.md sidecar when one exists.
      const sidecar = join(dirAbs, `${req.params.id.replace(/\.[^.]+$/, '')}.extracted.md`);
      if (await pathExists(sidecar)) {
        const body = await readFileP(sidecar, 'utf-8');
        return res.json({ date: req.params.date, id: req.params.id, body, extracted: true });
      }
      const body = await readFileP(abs, 'utf-8');
      return res.json({ date: req.params.date, id: req.params.id, body });
    } catch { return res.status(404).json({ error: 'Not found' }); }
  });

  router.get('/raw/:date/:id/binary', (req, res) => {
    const projectId = ctx.currentProjectId;
    const p = projectPaths();
    const abs = join(ctx.dataDir, 'projects', projectId, p.rawDir, req.params.date, req.params.id);
    const stream = createReadStream(abs);
    stream.on('error', () => res.status(404).end());
    stream.pipe(res);
  });

  return router;
}
