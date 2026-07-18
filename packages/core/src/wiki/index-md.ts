/**
 * INDEX.md maintenance — primary content-oriented catalog of the wiki,
 * per Karpathy's spec (docs/llm-wiki.md):
 *
 *   "It's a catalog of everything in the wiki — each page listed with a
 *    link, a one-line summary, and optionally metadata like date or source
 *    count. Organized by category (entities, concepts, sources, etc.).
 *    The LLM updates it on every ingest. When answering a query, the LLM
 *    reads the index first to find relevant pages, then drills into them."
 *
 * INDEX-first retrieval works "surprisingly well at moderate scale
 * (~100 sources, ~hundreds of pages) and avoids the need for embedding-
 * based RAG infrastructure."
 *
 * Format we write:
 *
 *   # MindBase Wiki Index
 *
 *   _Auto-maintained by the wiki engine. Edit at your own risk — changes
 *   may be overwritten on next ingest._
 *
 *   _Last regenerated: <ISO timestamp>_
 *
 *   ## Concepts (LLM-maintained — wiki/concepts/)
 *
 *   - [Title](wiki/concepts/slug.md) — one_liner _(N sources)_
 *
 *   ## Drafts (user-written — wiki/notes/)
 *
 *   - [Title](wiki/notes/slug.md) — one_liner
 *
 *   ## Sources (raw imports — wiki/sources/)
 *
 *   - [raw-id](wiki/sources/raw-id.md)
 */

import type { Store } from '../storage/store';
import type { MetaJson } from '../types';
import {
  listAllWikiPages,
  conceptPath,
  notePath,
  indexPath,
} from '../storage/paths';

interface IndexEntry {
  title: string;
  path: string;
  oneLiner: string;
  sourcesCount: number;
  updated: string;
  layer: 'concepts' | 'notes';
}

/**
 * Rebuild INDEX.md from the current on-disk state of wiki/concepts/ and
 * wiki/notes/. Idempotent — running multiple times yields the same file
 * (modulo the "Last regenerated" timestamp).
 */
export async function rebuildIndex(store: Store): Promise<{ totalPages: number; concepts: number; drafts: number; sources: number }> {
  const entries = await listAllWikiPages(store);
  const indexEntries: IndexEntry[] = [];

  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.meta.json')) continue;
    const slug = entry.name.replace(/\.meta\.json$/, '');
    try {
      const meta = await store.readJSON<MetaJson>(`wiki/${entry.layer}/${entry.name}`);
      const path = entry.layer === 'concepts' ? conceptPath(slug) : notePath(slug);
      indexEntries.push({
        title: meta.title || slug,
        path,
        oneLiner: meta.one_liner ?? '',
        sourcesCount: Array.isArray(meta.sources) ? meta.sources.length : 0,
        updated: meta.updated ?? '',
        layer: entry.layer,
      });
    } catch {
      /* skip malformed */
    }
  }

  // List source stubs
  let sourceStubs: string[] = [];
  try {
    const srcs = await store.listDir('wiki/sources');
    sourceStubs = srcs
      .filter((s) => s.kind === 'file' && s.name.endsWith('.md'))
      .map((s) => s.name.replace(/\.md$/, ''))
      .sort();
  } catch { /* no sources dir yet */ }

  const concepts = indexEntries
    .filter((e) => e.layer === 'concepts')
    .sort((a, b) => a.title.localeCompare(b.title));
  const drafts = indexEntries
    .filter((e) => e.layer === 'notes')
    .sort((a, b) => a.title.localeCompare(b.title));

  const lines: string[] = [
    '# MindBase Wiki Index',
    '',
    '_Auto-maintained by the wiki engine. Edit at your own risk — changes may be overwritten on next ingest._',
    '',
    `_Last regenerated: ${new Date().toISOString()}_`,
    '',
    `## Concepts — LLM-maintained (${concepts.length})`,
    '',
  ];
  if (concepts.length === 0) {
    lines.push('_(no concept pages yet — ingest a source to start building the wiki)_');
  } else {
    for (const c of concepts) {
      const meta = c.sourcesCount > 0 ? ` _(${c.sourcesCount} source${c.sourcesCount > 1 ? 's' : ''})_` : '';
      const oneLiner = c.oneLiner ? ` — ${c.oneLiner}` : '';
      lines.push(`- [${c.title}](${c.path})${oneLiner}${meta}`);
    }
  }
  lines.push('');
  lines.push(`## Drafts — user-written (${drafts.length})`);
  lines.push('');
  if (drafts.length === 0) {
    lines.push('_(no drafts)_');
  } else {
    for (const d of drafts) {
      const oneLiner = d.oneLiner ? ` — ${d.oneLiner}` : '';
      lines.push(`- [${d.title}](${d.path})${oneLiner}`);
    }
  }
  lines.push('');
  lines.push(`## Sources — raw imports (${sourceStubs.length})`);
  lines.push('');
  if (sourceStubs.length === 0) {
    lines.push('_(no sources)_');
  } else {
    for (const id of sourceStubs) {
      lines.push(`- [${id}](wiki/sources/${id}.md)`);
    }
  }
  lines.push('');

  await store.writeText(indexPath(), lines.join('\n'));
  return {
    totalPages: indexEntries.length,
    concepts: concepts.length,
    drafts: drafts.length,
    sources: sourceStubs.length,
  };
}

/**
 * Surgical add: append a single concept page to INDEX.md without rebuilding
 * everything. Used by the compile executor's createConcept call so the LLM
 * doesn't need to explicitly emit add_to_index actions.
 *
 * If the page is already in INDEX (matched by path), no-op (idempotent).
 * If INDEX.md is missing or malformed, falls back to rebuildIndex.
 */
export async function indexUpsertConcept(
  store: Store,
  slug: string,
  title: string,
  oneLiner: string,
  sourcesCount: number,
): Promise<void> {
  const idx = indexPath();
  const path = conceptPath(slug);
  let body: string;
  try {
    body = await store.readText(idx);
  } catch {
    // INDEX.md doesn't exist — bootstrap via full rebuild.
    await rebuildIndex(store);
    return;
  }

  // Already present? skip
  if (body.includes(path)) return;

  // Insert into the "Concepts" section. If absent, fall back to full rebuild.
  const conceptsHeaderRe = /^## Concepts — LLM-maintained.*$/m;
  if (!conceptsHeaderRe.test(body)) {
    await rebuildIndex(store);
    return;
  }

  const meta = sourcesCount > 0 ? ` _(${sourcesCount} source${sourcesCount > 1 ? 's' : ''})_` : '';
  const oneLinerStr = oneLiner ? ` — ${oneLiner}` : '';
  const newLine = `- [${title}](${path})${oneLinerStr}${meta}`;

  // Split body into lines, find Concepts section, insert in alphabetical order.
  const lines = body.split('\n');
  let headerIdx = -1;
  let sectionEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (conceptsHeaderRe.test(lines[i] ?? '')) {
      headerIdx = i;
      // Find the next "## " heading or end
      for (let j = i + 1; j < lines.length; j++) {
        if (/^## /.test(lines[j] ?? '')) {
          sectionEnd = j;
          break;
        }
      }
      if (sectionEnd === -1) sectionEnd = lines.length;
      break;
    }
  }
  if (headerIdx < 0) {
    await rebuildIndex(store);
    return;
  }

  // Strip the empty-state placeholder line if present
  const filteredSection = lines
    .slice(headerIdx + 1, sectionEnd)
    .filter((l) => !/^_\(no concept pages yet/.test(l));

  // Collect existing item lines + the new one
  const itemRe = /^- \[(.+?)\]\(/;
  const items: string[] = [];
  const nonItems: string[] = [];
  for (const l of filteredSection) {
    if (itemRe.test(l)) items.push(l);
    else nonItems.push(l);
  }
  items.push(newLine);
  // Sort items alphabetically by title
  items.sort((a, b) => {
    const ta = a.match(itemRe)?.[1] ?? a;
    const tb = b.match(itemRe)?.[1] ?? b;
    return ta.localeCompare(tb);
  });

  // Update the section header's count too
  const newHeader = `## Concepts — LLM-maintained (${items.length})`;
  const newSection = [newHeader, ...nonItems, ...items];

  const newLines = [
    ...lines.slice(0, headerIdx),
    ...newSection,
    ...lines.slice(sectionEnd),
  ];
  await store.writeText(idx, newLines.join('\n'));
}
