import type { DirEntry, Store } from './store';

/**
 * Wraps any Store and prepends `projects/<id>/` to every path that doesn't
 * already start with `projects/`, `meta/`, `config.json`, or a few other
 * unscoped roots.
 *
 * This is the key abstraction that makes Phase 2 a non-rewrite: every
 * existing reader that calls store.readText('wiki/concepts/foo.md')
 * keeps working unchanged — it just resolves to the current project's
 * scope automatically.
 *
 * Setting / swapping the project id is via the constructor — for a switch,
 * create a new ProjectScopedStore instance (the server context does this).
 */
const UNSCOPED_PREFIXES = [
  'projects/',
  'meta/',
  'config.json',
  'attachments/',   // shared across projects for now (image OCR sidecars)
  'trash/',         // global trash
];

function shouldScope(path: string): boolean {
  for (const prefix of UNSCOPED_PREFIXES) {
    if (path === prefix || path.startsWith(prefix)) return false;
  }
  return true;
}

export class ProjectScopedStore implements Store {
  constructor(
    private readonly inner: Store,
    private readonly projectId: string,
  ) {}

  private scope(path: string): string {
    return shouldScope(path) ? `projects/${this.projectId}/${path}` : path;
  }

  writeText(path: string, content: string): Promise<void> {
    return this.inner.writeText(this.scope(path), content);
  }
  readText(path: string): Promise<string> {
    return this.inner.readText(this.scope(path));
  }
  writeJSON(path: string, value: unknown): Promise<void> {
    return this.inner.writeJSON(this.scope(path), value);
  }
  readJSON<T>(path: string): Promise<T> {
    return this.inner.readJSON<T>(this.scope(path));
  }
  writeBinary(path: string, data: Uint8Array | ArrayBuffer): Promise<void> {
    return this.inner.writeBinary(this.scope(path), data);
  }
  readBinary(path: string): Promise<Uint8Array> {
    return this.inner.readBinary(this.scope(path));
  }
  exists(path: string): Promise<boolean> {
    return this.inner.exists(this.scope(path));
  }
  listDir(path: string): Promise<DirEntry[]> {
    return this.inner.listDir(this.scope(path));
  }
  remove(path: string): Promise<void> {
    return this.inner.remove(this.scope(path));
  }

  /** Escape hatch: access the underlying unscoped store (e.g. for migration). */
  unscoped(): Store {
    return this.inner;
  }

  getProjectId(): string {
    return this.projectId;
  }
}
