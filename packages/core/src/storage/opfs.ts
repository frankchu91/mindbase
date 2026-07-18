// Narrow wrapper over FileSystemDirectoryHandle (OPFS).
// All consumers go through this class; tests swap in an in-memory handle.

import type { DirEntry, Store } from './store';

export type { DirEntry };

export class OPFSStore implements Store {
  constructor(private root: FileSystemDirectoryHandle) {}

  /** Get the root's OPFS handle for the current origin. */
  static async open(): Promise<OPFSStore> {
    const root: FileSystemDirectoryHandle = await navigator.storage.getDirectory();
    return new OPFSStore(root);
  }

  private splitPath(path: string): { parts: string[]; leaf: string } {
    const parts = path.split('/').filter((p) => p.length > 0);
    if (parts.length === 0) throw new Error(`Empty path`);
    const leaf = parts.pop()!;
    return { parts, leaf };
  }

  private async resolveDir(
    parts: string[],
    create: boolean,
  ): Promise<FileSystemDirectoryHandle> {
    let dir: FileSystemDirectoryHandle = this.root;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create });
    }
    return dir;
  }

  async writeText(path: string, content: string): Promise<void> {
    const { parts, leaf } = this.splitPath(path);
    const dir = await this.resolveDir(parts, true);
    const fh = await dir.getFileHandle(leaf, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async readText(path: string): Promise<string> {
    const { parts, leaf } = this.splitPath(path);
    const dir = await this.resolveDir(parts, false);
    const fh = await dir.getFileHandle(leaf, { create: false });
    const file = await fh.getFile();
    return await file.text();
  }

  async writeJSON(path: string, value: unknown): Promise<void> {
    await this.writeText(path, JSON.stringify(value, null, 2));
  }

  async writeBinary(path: string, data: Uint8Array | ArrayBuffer): Promise<void> {
    const { parts, leaf } = this.splitPath(path);
    const dir = await this.resolveDir(parts, true);
    const fh = await dir.getFileHandle(leaf, { create: true });
    const writable = await fh.createWritable();
    await writable.write(data instanceof ArrayBuffer ? data : data.buffer as ArrayBuffer);
    await writable.close();
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const { parts, leaf } = this.splitPath(path);
    const dir = await this.resolveDir(parts, false);
    const fh = await dir.getFileHandle(leaf, { create: false });
    const file = await fh.getFile();
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }

  async readJSON<T>(path: string): Promise<T> {
    const text = await this.readText(path);
    return JSON.parse(text) as T;
  }

  async exists(path: string): Promise<boolean> {
    const { parts, leaf } = this.splitPath(path);
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await this.resolveDir(parts, false);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return false;
      throw e;
    }
    try {
      await dir.getFileHandle(leaf, { create: false });
      return true;
    } catch (e) {
      if (!(e instanceof DOMException)) throw e;
      if (e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') throw e;
      // Fall through to directory probe.
    }
    try {
      await dir.getDirectoryHandle(leaf, { create: false });
      return true;
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return false;
      throw e;
    }
  }

  async remove(path: string): Promise<void> {
    const { parts, leaf } = this.splitPath(path);
    const dir = await this.resolveDir(parts, false);
    await dir.removeEntry(leaf);
  }

  async listDir(path: string): Promise<DirEntry[]> {
    try {
      const parts = path.split('/').filter((p) => p.length > 0);
      const dir = await this.resolveDir(parts, false);
      const entries: DirEntry[] = [];
      // @ts-expect-error — entries() is async iterable on FileSystemDirectoryHandle
      for await (const [name, handle] of dir.entries()) {
        entries.push({ name, kind: handle.kind });
      }
      return entries;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return [];
      throw e;
    }
  }
}
