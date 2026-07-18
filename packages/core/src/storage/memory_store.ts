import type { DirEntry, Store } from './store';

interface FSNode {
  kind: 'file' | 'directory';
  content?: string;
  children?: Map<string, FSNode>;
}

export class MemoryStore implements Store {
  private root: FSNode = { kind: 'directory', children: new Map() };

  private splitPath(path: string): string[] {
    return path.split('/').filter((p) => p.length > 0);
  }

  private resolveParent(parts: string[], create: boolean): FSNode {
    let node = this.root;
    for (const part of parts) {
      if (!node.children) node.children = new Map();
      let child = node.children.get(part);
      if (!child) {
        if (!create) throw new Error(`Not found: ${part}`);
        child = { kind: 'directory', children: new Map() };
        node.children.set(part, child);
      }
      if (child.kind !== 'directory') throw new Error(`Not a directory: ${part}`);
      node = child;
    }
    return node;
  }

  async writeText(path: string, content: string): Promise<void> {
    const parts = this.splitPath(path);
    if (parts.length === 0) throw new Error('Empty path');
    const leaf = parts.pop()!;
    const parent = this.resolveParent(parts, true);
    if (!parent.children) parent.children = new Map();
    parent.children.set(leaf, { kind: 'file', content });
  }

  async readText(path: string): Promise<string> {
    const parts = this.splitPath(path);
    if (parts.length === 0) throw new Error('Empty path');
    const leaf = parts.pop()!;
    const parent = this.resolveParent(parts, false);
    const node = parent.children?.get(leaf);
    if (!node || node.kind !== 'file') throw new Error(`File not found: ${path}`);
    return node.content ?? '';
  }

  async writeJSON(path: string, value: unknown): Promise<void> {
    await this.writeText(path, JSON.stringify(value, null, 2));
  }

  async writeBinary(path: string, data: Uint8Array | ArrayBuffer): Promise<void> {
    // MemoryStore stores binary as base64 string for simplicity
    const buf = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data);
    await this.writeText(path, buf.toString('base64'));
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const text = await this.readText(path);
    const buf = Buffer.from(text, 'base64');
    return new Uint8Array(buf);
  }

  async readJSON<T>(path: string): Promise<T> {
    const text = await this.readText(path);
    return JSON.parse(text) as T;
  }

  async exists(path: string): Promise<boolean> {
    const parts = this.splitPath(path);
    if (parts.length === 0) return true; // root exists
    const leaf = parts.pop()!;
    try {
      const parent = this.resolveParent(parts, false);
      return parent.children?.has(leaf) ?? false;
    } catch {
      return false;
    }
  }

  async listDir(path: string): Promise<DirEntry[]> {
    const parts = this.splitPath(path);
    try {
      const node = this.resolveParent(parts, false);
      if (!node.children) return [];
      const entries: DirEntry[] = [];
      for (const [name, child] of node.children) {
        entries.push({ name, kind: child.kind });
      }
      return entries;
    } catch {
      return [];
    }
  }

  async remove(path: string): Promise<void> {
    const parts = this.splitPath(path);
    if (parts.length === 0) throw new Error('Cannot remove root');
    const leaf = parts.pop()!;
    const parent = this.resolveParent(parts, false);
    if (!parent.children?.has(leaf)) throw new Error(`Not found: ${path}`);
    parent.children.delete(leaf);
  }
}
