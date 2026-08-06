// apps/server/src/ops/gather.ts
//
// Input gathering for ops recipes. Pure fs reads over a project root; no
// LLM involvement. Caps keep prompts inside local-model context budgets.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface ProjectCore { context: string; indexYaml: string; readme: string }
export interface SourceFile { path: string; body: string }

const MAX_SOURCE_FILES = 30;
const MAX_SOURCE_CHARS = 4_000;

export async function gatherProjectCore(root: string): Promise<ProjectCore> {
  const read = (rel: string) => readFile(join(root, rel), 'utf-8').catch(() => '');
  const [context, indexYaml, readme] = await Promise.all([read('context.md'), read('index.yaml'), read('README.md')]);
  return { context, indexYaml, readme };
}

async function listFilesRec(dir: string, rel: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) out.push(...(await listFilesRec(join(dir, e.name), `${rel}/${e.name}`)));
    else if (e.name.endsWith('.md') && !e.name.endsWith('.extracted.md')) out.push(`${rel}/${e.name}`);
  }
  return out;
}

/**
 * Sources considered "unbuilt": contributor + research files modified after
 * context.md. When context.md is missing, everything counts. Newest first,
 * capped for prompt budget.
 */
export interface ResearchPage {
  path: string;
  slug: string;
  excerpt: string;
  outbound: string[];
  inboundCount: number;
}

const MAX_LINT_PAGES = 40;
const MAX_EXCERPT_CHARS = 1_200;

/**
 * All research pages with excerpts + the wikilink graph between them
 * (outbound [[slugs]] and inbound counts) — the deterministic evidence
 * the lint recipe hands the LLM so orphan/contradiction hunting isn't
 * left to model recall alone.
 */
export async function gatherResearchPages(root: string): Promise<ResearchPage[]> {
  const rels = (await listFilesRec(join(root, 'sources', 'research'), 'sources/research')).slice(0, MAX_LINT_PAGES);
  const pages = await Promise.all(
    rels.map(async (rel) => {
      const body = await readFile(join(root, rel), 'utf-8').catch(() => '');
      const outbound = [...new Set([...body.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1]!.trim()))];
      const slug = (rel.split('/').pop() ?? rel).replace(/\.md$/, '');
      return { path: rel, slug, excerpt: body.slice(0, MAX_EXCERPT_CHARS), outbound, inboundCount: 0 };
    }),
  );
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  for (const p of pages) for (const target of p.outbound) {
    const hit = bySlug.get(target);
    if (hit && hit !== p) hit.inboundCount += 1;
  }
  return pages;
}

export async function gatherUnbuiltSources(root: string): Promise<SourceFile[]> {
  const contextMtime = await stat(join(root, 'context.md')).then((s) => s.mtimeMs).catch(() => 0);
  const rels = [
    ...(await listFilesRec(join(root, 'sources', 'contributors'), 'sources/contributors')),
    ...(await listFilesRec(join(root, 'sources', 'research'), 'sources/research')),
  ];
  const withM = await Promise.all(
    rels.map(async (rel) => ({ rel, mtime: await stat(join(root, rel)).then((s) => s.mtimeMs).catch(() => 0) })),
  );
  const fresh = withM.filter((f) => f.mtime > contextMtime).sort((a, b) => b.mtime - a.mtime).slice(0, MAX_SOURCE_FILES);
  return Promise.all(
    fresh.map(async ({ rel }) => ({
      path: rel,
      body: (await readFile(join(root, rel), 'utf-8').catch(() => '')).slice(0, MAX_SOURCE_CHARS),
    })),
  );
}
