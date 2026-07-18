import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ingestPaste } from '@mindbase/core';
import type { ServerContext } from '../context';
import { loadManifest, contentHash, isDuplicate } from '../manifest';

interface HistorySource {
  id: string;
  name: string;
  path: string;
  count: number;
}

async function findClaudeHistories(): Promise<HistorySource[]> {
  const sources: HistorySource[] = [];
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  try {
    const projects = await fs.readdir(claudeDir);
    for (const proj of projects) {
      const projDir = path.join(claudeDir, proj);
      const stat = await fs.stat(projDir);
      if (!stat.isDirectory()) continue;
      const files = await fs.readdir(projDir);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
      if (jsonlFiles.length > 0) {
        sources.push({
          id: `claude:${proj}`,
          name: `Claude Code — ${proj.replace(/-/g, '/')}`,
          path: projDir,
          count: jsonlFiles.length,
        });
      }
    }
  } catch { /* ~/.claude doesn't exist */ }
  return sources;
}

async function parseClaudeJsonl(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());
  const parts: string[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'human' || obj.type === 'assistant') {
        const text = typeof obj.message?.content === 'string'
          ? obj.message.content
          : Array.isArray(obj.message?.content)
            ? obj.message.content.filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n')
            : '';
        if (text.trim()) parts.push(`**${obj.type}:** ${text.slice(0, 2000)}`);
      }
    } catch { /* skip malformed lines */ }
  }
  return parts.join('\n\n');
}

export function agentHistoryRoutes(ctx: ServerContext): Router {
  const router = Router();

  // List available agent histories
  router.get('/sources', async (_req, res) => {
    try {
      const sources = await findClaudeHistories();
      res.json({ sources });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Import a specific history source
  router.post('/import', async (req, res) => {
    const { sourceId } = req.body as { sourceId: string };
    if (!sourceId) { res.status(400).json({ error: 'sourceId required' }); return; }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let imported = 0;
    let skipped = 0;

    try {
      const sources = await findClaudeHistories();
      const source = sources.find((s) => s.id === sourceId);
      if (!source) { res.write(`data: ${JSON.stringify({ kind: 'error', error: 'source not found' })}\n\n`); res.end(); return; }

      const files = await fs.readdir(source.path);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
      const manifest = await loadManifest(ctx.store);

      for (const file of jsonlFiles) {
        const filePath = path.join(source.path, file);
        try {
          const text = await parseClaudeJsonl(filePath);
          if (!text.trim() || text.length < 100) { skipped++; continue; }

          const hash = contentHash(text);
          if (isDuplicate(manifest, hash)) { skipped++; continue; }

          res.write(`data: ${JSON.stringify({ kind: 'progress', file, status: 'ingesting' })}\n\n`);
          await ingestPaste(ctx.store, {
            text: text.slice(0, 15000),
            title: `Claude session ${file.replace('.jsonl', '').slice(0, 8)}`,
            source_url: `file://${filePath}`,
          });
          imported++;
        } catch {
          skipped++;
        }
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ kind: 'error', error: (e as Error).message })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ kind: 'done', imported, skipped })}\n\n`);
    res.end();
  });

  return router;
}
