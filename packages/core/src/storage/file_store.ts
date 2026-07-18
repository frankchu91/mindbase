import fs from 'node:fs/promises';
import nodePath from 'node:path';
import type { DirEntry, Store } from './store';

export interface TrashEntry {
  id: string;          // <iso-timestamp>-<short-random>
  label: string;       // human-readable: usually the slug
  deletedAt: string;   // ISO
  files: Array<{
    originalPath: string;
    /** Captured from the file's .meta.json `kind` at delete time so the UI can
     *  classify into Notes/Wiki/Chats tabs without re-reading meta files.
     *  Optional because chats and raw imports don't have a `kind`. */
    kind?: string;
    /** Captured from the file's .meta.json `title` at delete time so the UI
     *  shows human-readable names instead of raw slugs. */
    title?: string;
  }>;
}

export class FileStore implements Store {
  constructor(private rootDir: string) {}

  private resolve(filePath: string): string {
    return nodePath.join(this.rootDir, filePath);
  }

  async writeText(path: string, content: string): Promise<void> {
    const full = this.resolve(path);
    await fs.mkdir(nodePath.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');
  }

  async readText(path: string): Promise<string> {
    return fs.readFile(this.resolve(path), 'utf-8');
  }

  async writeJSON(path: string, value: unknown): Promise<void> {
    await this.writeText(path, JSON.stringify(value, null, 2));
  }

  async writeBinary(path: string, data: Uint8Array | ArrayBuffer): Promise<void> {
    const full = this.resolve(path);
    await fs.mkdir(nodePath.dirname(full), { recursive: true });
    await fs.writeFile(full, data instanceof ArrayBuffer ? Buffer.from(data) : data);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const abs = this.resolve(path);
    const buf = await fs.readFile(abs);
    return new Uint8Array(buf);
  }

  async readJSON<T>(path: string): Promise<T> {
    const text = await this.readText(path);
    return JSON.parse(text) as T;
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(path));
      return true;
    } catch {
      return false;
    }
  }

  async listDir(path: string): Promise<DirEntry[]> {
    try {
      const entries = await fs.readdir(this.resolve(path), { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        kind: e.isDirectory() ? 'directory' as const : 'file' as const,
      }));
    } catch {
      return [];
    }
  }

  async remove(path: string): Promise<void> {
    await fs.rm(this.resolve(path), { force: true });
  }

  // ─── Trash methods (server-only; not part of the Store interface) ───────────

  private trashDir(): string {
    return nodePath.join(this.rootDir, '.trash');
  }

  private trashEntryDir(entryId: string): string {
    return nodePath.join(this.trashDir(), entryId);
  }

  /**
   * Move files to the trash. All paths are relative to the root dir.
   * Creates a trash entry directory with a manifest.json describing the original paths.
   * Returns the TrashEntry. Uses fs.rename for atomic moves on the same filesystem.
   */
  async moveToTrash(paths: string[]): Promise<TrashEntry> {
    const now = new Date();
    const isoTs = now.toISOString().replace(/[:.]/g, '-');
    const rand = Math.random().toString(36).slice(2, 7);
    const entryId = `${isoTs}-${rand}`;
    const entryDir = this.trashEntryDir(entryId);

    await fs.mkdir(entryDir, { recursive: true });

    // Derive a label from the first path that has a meaningful filename
    const firstPath = paths.find((p) => p.endsWith('.md') || p.endsWith('.meta.json')) ?? paths[0] ?? '';
    const label = nodePath.basename(firstPath).replace(/\.(md|meta\.json)$/, '');

    // First pass: snapshot kind + title from sibling .meta.json files BEFORE
    // we move anything (otherwise the meta file may be the next one to move
    // and we'd lose access). Maps a .md path → its meta snapshot.
    const metaByMdPath = new Map<string, { kind?: string; title?: string }>();
    for (const relPath of paths) {
      if (!relPath.endsWith('.md')) continue;
      const metaRel = relPath.replace(/\.md$/, '.meta.json');
      try {
        const metaText = await fs.readFile(this.resolve(metaRel), 'utf-8');
        const meta = JSON.parse(metaText) as { kind?: string; title?: string };
        // Note: a missing `kind` is normalized to 'concept' here so the trash UI
        // groups the file under the Wiki tab. This matches the listing endpoint's
        // default (apps/server/src/routes/wiki.ts: `meta.kind ?? 'concept'`).
        const snap: { kind?: string; title?: string } = {};
        snap.kind = meta.kind ?? 'concept';
        if (meta.title) snap.title = meta.title;
        metaByMdPath.set(relPath, snap);
      } catch { /* no meta or unreadable — entry stays untagged */ }
    }
    // Chats have a .json file (no sibling meta) — derive title from the chat body if possible
    for (const relPath of paths) {
      if (!relPath.startsWith('chats/') || !relPath.endsWith('.json')) continue;
      try {
        const txt = await fs.readFile(this.resolve(relPath), 'utf-8');
        const body = JSON.parse(txt) as { title?: string };
        if (body.title) metaByMdPath.set(relPath, { title: body.title });
      } catch { /* unreadable — skip */ }
    }

    const movedFiles: Array<{ originalPath: string; kind?: string; title?: string }> = [];
    for (const relPath of paths) {
      const srcAbs = this.resolve(relPath);
      try { await fs.access(srcAbs); }
      catch { continue; /* missing source — skip silently */ }
      const destAbs = nodePath.join(entryDir, relPath);
      await fs.mkdir(nodePath.dirname(destAbs), { recursive: true });
      await fs.rename(srcAbs, destAbs);
      const snap = metaByMdPath.get(relPath);
      const entry: { originalPath: string; kind?: string; title?: string } = { originalPath: relPath };
      if (snap?.kind) entry.kind = snap.kind;
      if (snap?.title) entry.title = snap.title;
      movedFiles.push(entry);
    }

    const entry: TrashEntry = {
      id: entryId,
      label,
      deletedAt: now.toISOString(),
      files: movedFiles,
    };

    await fs.writeFile(nodePath.join(entryDir, 'manifest.json'), JSON.stringify(entry, null, 2), 'utf-8');
    return entry;
  }

  /** List all trash entries, newest first. */
  async listTrash(): Promise<TrashEntry[]> {
    let subdirs: string[];
    try {
      const entries = await fs.readdir(this.trashDir(), { withFileTypes: true });
      subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }

    const results: TrashEntry[] = [];
    for (const name of subdirs) {
      const manifestPath = nodePath.join(this.trashDir(), name, 'manifest.json');
      try {
        const raw = await fs.readFile(manifestPath, 'utf-8');
        const entry = JSON.parse(raw) as TrashEntry;
        // Retroactively backfill `kind` and `title` for legacy entries that
        // were trashed before those fields were captured at delete time.
        // The .meta.json files are still inside the trash entry dir, so we
        // can read them here to give the UI human-readable labels + correct
        // category routing for old entries.
        await this.backfillTrashEntryMeta(name, entry);
        results.push(entry);
      } catch {
        // Corrupt or missing manifest — skip
      }
    }

    // Newest first by deletedAt
    results.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    return results;
  }

  /** Fill in missing `kind`/`title` on a trash entry's file list by reading the
   *  meta.json siblings that live inside the trash entry directory. No-op for
   *  entries that already have both fields populated. */
  private async backfillTrashEntryMeta(entryId: string, entry: TrashEntry): Promise<void> {
    for (const f of entry.files) {
      if (f.kind && f.title) continue;
      if (!f.originalPath.endsWith('.md')) continue;
      const metaRel = f.originalPath.replace(/\.md$/, '.meta.json');
      const metaAbs = nodePath.join(this.trashEntryDir(entryId), metaRel);
      try {
        const text = await fs.readFile(metaAbs, 'utf-8');
        const meta = JSON.parse(text) as { kind?: string; title?: string };
        if (!f.kind) f.kind = meta.kind ?? 'concept';
        if (!f.title && meta.title) f.title = meta.title;
      } catch { /* meta missing — leave as-is */ }
    }
  }

  /**
   * Restore a trash entry back to its original paths.
   * Files that already exist at the destination are skipped (not overwritten).
   * Returns { restored, skipped } lists of relative paths.
   */
  async restoreFromTrash(entryId: string): Promise<{ restored: string[]; skipped: string[] }> {
    const entryDir = this.trashEntryDir(entryId);
    const manifestPath = nodePath.join(entryDir, 'manifest.json');

    let entry: TrashEntry;
    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      entry = JSON.parse(raw) as TrashEntry;
    } catch {
      throw new Error(`Trash entry not found: ${entryId}`);
    }

    const restored: string[] = [];
    const skipped: string[] = [];

    for (const { originalPath } of entry.files) {
      const srcAbs = nodePath.join(entryDir, originalPath);
      const destAbs = this.resolve(originalPath);

      // Check collision
      try {
        await fs.access(destAbs);
        // Destination already exists — skip
        skipped.push(originalPath);
        continue;
      } catch {
        // Doesn't exist — safe to restore
      }

      await fs.mkdir(nodePath.dirname(destAbs), { recursive: true });
      await fs.rename(srcAbs, destAbs);
      restored.push(originalPath);
    }

    // Remove the trash entry dir (even if partially restored — manifest stays consistent)
    await fs.rm(entryDir, { recursive: true, force: true });
    return { restored, skipped };
  }

  /** Permanently delete a single trash entry. */
  async permanentlyDelete(entryId: string): Promise<void> {
    const entryDir = this.trashEntryDir(entryId);
    // Verify it exists (throws if not)
    try {
      await fs.access(entryDir);
    } catch {
      throw new Error(`Trash entry not found: ${entryId}`);
    }
    await fs.rm(entryDir, { recursive: true, force: true });
  }

  /** Empty the entire trash — rm -rf .trash/ */
  async emptyTrash(): Promise<void> {
    await fs.rm(this.trashDir(), { recursive: true, force: true });
  }
}
