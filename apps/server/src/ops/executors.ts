// apps/server/src/ops/executors.ts
//
// Applies validated ops actions to a project directory. All writes are
// path-checked against the project root; context.md updates snapshot the
// previous version first (same contract as mindbase_atomic_write_context).
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { type Action, type ApplyResult, CONTEXT_LINE_CAP } from './types';

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

/** Resolve rel under root; throw on escape. Belt-and-braces after zod. */
function safeAbs(root: string, rel: string): string {
  const abs = resolve(root, rel);
  if (!abs.startsWith(resolve(root) + sep) && abs !== resolve(root)) {
    throw new Error(`path escapes project root: ${rel}`);
  }
  return abs;
}

function lineCount(s: string): number {
  return s.split('\n').length;
}

async function applyOne(root: string, action: Action): Promise<string> {
  switch (action.kind) {
    case 'create_research_page': {
      const dir = safeAbs(root, 'sources/research');
      await mkdir(dir, { recursive: true });
      let base = action.slug;
      for (let i = 2; await exists(join(dir, `${base}.md`)); i++) base = `${action.slug}-${i}`;
      const rel = `sources/research/${base}.md`;
      await writeFile(safeAbs(root, rel), action.markdown, 'utf-8');
      return rel;
    }
    case 'update_context': {
      if (lineCount(action.markdown) > CONTEXT_LINE_CAP) {
        throw new Error(`context.md would be ${lineCount(action.markdown)} lines — the cap is ${CONTEXT_LINE_CAP}. Move detail into a research page instead.`);
      }
      const ctxAbs = safeAbs(root, 'context.md');
      const snapDir = safeAbs(root, 'state/builder/snapshots');
      await mkdir(snapDir, { recursive: true });
      const prev = await readFile(ctxAbs, 'utf-8').catch(() => '');
      if (prev) {
        await writeFile(join(snapDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.md`), prev, 'utf-8');
      }
      await writeFile(ctxAbs, action.markdown, 'utf-8');
      return 'context.md';
    }
    case 'append_context_section': {
      const ctxAbs = safeAbs(root, 'context.md');
      const current = await readFile(ctxAbs, 'utf-8').catch(() => '');
      const heading = `## ${action.section}`;
      let next: string;
      const idx = current.indexOf(`\n${heading}`);
      if (idx >= 0) {
        // Insert before the next section heading (or at end).
        const sectionStart = idx + 1 + heading.length;
        const rest = current.slice(sectionStart);
        const nextHeading = rest.search(/\n## /);
        const insertAt = nextHeading >= 0 ? sectionStart + nextHeading : current.length;
        next = `${current.slice(0, insertAt).replace(/\n*$/, '\n\n')}${action.markdown.trim()}\n${current.slice(insertAt)}`;
      } else {
        next = `${current.replace(/\n*$/, '\n\n')}${heading}\n\n${action.markdown.trim()}\n`;
      }
      if (lineCount(next) > CONTEXT_LINE_CAP) {
        throw new Error(`appending would push context.md over ${CONTEXT_LINE_CAP} lines`);
      }
      await writeFile(ctxAbs, next, 'utf-8');
      return 'context.md';
    }
    case 'add_wikilinks': {
      const abs = safeAbs(root, action.path);
      const current = await readFile(abs, 'utf-8');
      const missing = action.links.filter((l) => !current.includes(`[[${l}]]`));
      if (missing.length === 0) return action.path;
      const seeAlso = `See also: ${missing.map((l) => `[[${l}]]`).join(', ')}`;
      await writeFile(abs, `${current.replace(/\n*$/, '\n\n')}${seeAlso}\n`, 'utf-8');
      return action.path;
    }
  }
}

export async function applyActions(root: string, actions: Action[]): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], failed: [] };
  for (const action of actions) {
    try {
      result.applied.push(await applyOne(root, action));
    } catch (e) {
      result.failed.push({ action: action.kind, error: (e as Error).message });
    }
  }
  return result;
}
