/**
 * One-shot migration: move AI-compiled wiki pages from wiki/notes/ to
 * wiki/concepts/ so they live in the LLM-owned layer per Karpathy's
 * 3-layer architecture (docs/pivot-plan-2026-05-25.md).
 *
 * Identification rule: a page is considered LLM-owned (concept) if its
 * meta.compile_version > 0. This catches every page that was written by
 * the compile pipeline, regardless of whether the user later opened it.
 *
 * User-written notes (compile_version === 0 OR missing) stay in
 * wiki/notes/. Pages with `edit_state === 'human_touched'` AND
 * compile_version > 0 are flagged but still moved — the human edit
 * promotes them in the user's eyes but they still originated from AI.
 *
 * Idempotent: re-running is safe; pages already in concepts/ are skipped.
 *
 * Usage: `pnpm -F @mindbase/server tsx src/scripts/migrate-concepts-to-layer.ts [--dry-run]`
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

interface MetaShape {
  compile_version?: number;
  edit_state?: string;
  title?: string;
}

const DATA_ROOT = process.env['MINDBASE_DATA_DIR'] ?? path.join(os.homedir(), 'mindbase-data');
const NOTES_DIR = path.join(DATA_ROOT, 'wiki', 'notes');
const CONCEPTS_DIR = path.join(DATA_ROOT, 'wiki', 'concepts');

interface MoveCandidate {
  slug: string;
  mdSrc: string;
  metaSrc: string;
  mdDst: string;
  metaDst: string;
  compileVersion: number;
  humanTouched: boolean;
  title: string;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`MindBase concept migration — data root: ${DATA_ROOT}`);
  console.log(`Dry run: ${dryRun ? 'YES (no files moved)' : 'no (will move files)'}\n`);

  try {
    await fs.access(NOTES_DIR);
  } catch {
    console.log('No wiki/notes/ dir — nothing to migrate.');
    return;
  }

  await fs.mkdir(CONCEPTS_DIR, { recursive: true });

  const entries = await fs.readdir(NOTES_DIR);
  const candidates: MoveCandidate[] = [];
  let scanned = 0;

  for (const name of entries) {
    if (!name.endsWith('.meta.json')) continue;
    scanned++;
    const slug = name.replace(/\.meta\.json$/, '');
    const metaSrc = path.join(NOTES_DIR, name);
    const mdSrc = path.join(NOTES_DIR, `${slug}.md`);

    let meta: MetaShape;
    try {
      meta = JSON.parse(await fs.readFile(metaSrc, 'utf8'));
    } catch (e) {
      console.warn(`  skip ${slug} — malformed meta: ${(e as Error).message}`);
      continue;
    }

    const compileVersion = typeof meta.compile_version === 'number' ? meta.compile_version : 0;
    if (compileVersion <= 0) continue;

    const mdDst = path.join(CONCEPTS_DIR, `${slug}.md`);
    const metaDst = path.join(CONCEPTS_DIR, name);
    candidates.push({
      slug,
      mdSrc,
      metaSrc,
      mdDst,
      metaDst,
      compileVersion,
      humanTouched: meta.edit_state === 'human_touched',
      title: meta.title ?? '(untitled)',
    });
  }

  console.log(`Scanned ${scanned} meta files in wiki/notes/`);
  console.log(`Eligible to migrate (compile_version > 0): ${candidates.length}\n`);

  if (candidates.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  for (const c of candidates) {
    const flag = c.humanTouched ? ' [HUMAN_TOUCHED]' : '';
    console.log(`  v${c.compileVersion}${flag}  ${c.slug}  —  "${c.title}"`);
  }

  if (dryRun) {
    console.log('\nDry run — no files moved. Re-run without --dry-run to migrate.');
    return;
  }

  let moved = 0;
  let skipped = 0;
  for (const c of candidates) {
    try {
      // Idempotency: if the dst already exists, skip
      try {
        await fs.access(c.metaDst);
        console.log(`  skip ${c.slug} — already in concepts/`);
        skipped++;
        continue;
      } catch { /* doesn't exist — proceed */ }

      // Move both files atomically (rename is atomic within same filesystem)
      try {
        await fs.access(c.mdSrc);
        await fs.rename(c.mdSrc, c.mdDst);
      } catch {
        // md missing but meta present? Skip with warning.
        console.warn(`  warn ${c.slug} — meta present but .md missing in notes/`);
      }
      await fs.rename(c.metaSrc, c.metaDst);
      moved++;
      console.log(`  ✓ moved ${c.slug}`);
    } catch (e) {
      console.error(`  ✗ failed ${c.slug}: ${(e as Error).message}`);
    }
  }

  console.log(`\nDone. Moved ${moved}, skipped ${skipped}.`);
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
