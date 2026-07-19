import type { Store, DirEntry } from '../storage/store';

/**
 * Move pre-Phase-2 data (top-level wiki/ + raw/) into projects/default/.
 *
 * Idempotent + crash-safe by construction:
 *   - The bail check (projects/default/meta.json) is written LAST, so a
 *     crash mid-copy leaves the bail false; the next run will resume.
 *   - On resume, copyTree calls listDir on the source dirs; only files
 *     still present (not yet moved) are returned, so each file is copied
 *     at most once. Duplicate-write into the destination is a no-op
 *     overwrite (Store.writeText/writeBinary truncate).
 *   - Worst-case partial state: some files at new location, rest still
 *     at old. A re-run completes cleanly.
 *
 * Strategy: walk the directories and writeText/writeBinary to the new path,
 * then remove the old. Avoids needing Store.rename (not in the interface).
 *
 * Binary detection (isLikelyBinary) covers common formats: pdf, png,
 * jpe?g, gif, webp, mp3, mp4, wav, zip, epub. Unknown extensions are
 * read as text — acceptable since the typical raw/ contents are markdown
 * extractions + the listed binary types.
 */
export interface MigrationResult {
  ran: boolean;
  movedFiles: number;
  reason?: string;
}

async function copyTree(
  store: Store,
  srcDir: string,
  dstDir: string,
  isBinary: (name: string) => boolean,
): Promise<number> {
  let count = 0;
  let entries: DirEntry[];
  try {
    entries = await store.listDir(srcDir);
  } catch {
    return 0;
  }
  for (const e of entries) {
    const srcPath = `${srcDir}/${e.name}`;
    const dstPath = `${dstDir}/${e.name}`;
    if (e.kind === 'directory') {
      count += await copyTree(store, srcPath, dstPath, isBinary);
    } else {
      if (isBinary(e.name)) {
        const data = await store.readBinary(srcPath);
        await store.writeBinary(dstPath, data);
      } else {
        const data = await store.readText(srcPath);
        await store.writeText(dstPath, data);
      }
      await store.remove(srcPath);
      count++;
    }
  }
  return count;
}

function isLikelyBinary(name: string): boolean {
  return /\.(pdf|png|jpe?g|gif|webp|mp3|mp4|wav|zip|epub)$/i.test(name);
}

async function dirHasFiles(store: Store, dir: string): Promise<boolean> {
  let entries;
  try {
    entries = await store.listDir(dir);
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.kind === 'file') return true;
    if (e.kind === 'directory' && (await dirHasFiles(store, `${dir}/${e.name}`))) return true;
  }
  return false;
}

export async function migrateLegacyData(store: Store): Promise<MigrationResult> {
  if (await store.exists('projects/default/meta.json')) {
    return { ran: false, movedFiles: 0, reason: 'already migrated' };
  }

  // Empty leftover raw/ or wiki/ dirs must not count as legacy data — they
  // would re-trigger this migration (and resurrect the default project) on
  // every single boot.
  const hasLegacyRaw = await dirHasFiles(store, 'raw');
  const hasLegacyWiki = await dirHasFiles(store, 'wiki');

  // If any project already exists (e.g. created via mindbase_init_project),
  // there is nothing to migrate and no default scaffold is wanted — creating
  // one would put a broken v1 "Default project" in every user's switcher.
  if (!hasLegacyRaw && !hasLegacyWiki) {
    try {
      const entries = await store.listDir('projects');
      if (entries.some((e) => e.kind === 'directory')) {
        return { ran: false, movedFiles: 0, reason: 'v2 projects already present' };
      }
    } catch { /* projects/ missing — true first boot */ }
  }

  if (!hasLegacyRaw && !hasLegacyWiki) {
    // Fresh install — create the default project skeleton
    await store.writeJSON('projects/default/meta.json', {
      id: 'default',
      name: 'Default project',
      created: new Date().toISOString(),
      schemaVersion: 1,
    });
    await store.writeText('projects/default/wiki/concepts/.gitkeep', '');
    await store.writeText('projects/default/wiki/notes/.gitkeep', '');
    await store.writeText('projects/default/wiki/sources/.gitkeep', '');
    await store.writeText('projects/default/raw/.gitkeep', '');
    return { ran: true, movedFiles: 0, reason: 'fresh install scaffold' };
  }

  let moved = 0;
  if (hasLegacyRaw) {
    moved += await copyTree(store, 'raw', 'projects/default/raw', isLikelyBinary);
  }
  if (hasLegacyWiki) {
    moved += await copyTree(store, 'wiki', 'projects/default/wiki', isLikelyBinary);
  }

  await store.writeJSON('projects/default/meta.json', {
    id: 'default',
    name: 'Default project',
    created: new Date().toISOString(),
    schemaVersion: 1,
  });

  return { ran: true, movedFiles: moved };
}
