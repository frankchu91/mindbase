// In-memory mock of FileSystemDirectoryHandle for tests.
// Only implements the subset OPFSStore actually uses.

interface MockEntry {
  kind: 'file' | 'directory';
  content?: string; // for files
  children?: Map<string, MockEntry>; // for directories
}

class MockFileHandle {
  readonly kind = 'file' as const;
  constructor(public entry: MockEntry) {
    if (entry.kind !== 'file') throw new Error('not a file');
  }
  async getFile(): Promise<{ text(): Promise<string> }> {
    const text = this.entry.content ?? '';
    return { text: async () => text };
  }
  async createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }> {
    const entry = this.entry;
    return {
      async write(data: string) {
        entry.content = data;
      },
      async close() {},
    };
  }
}

class MockDirectoryHandle {
  readonly kind = 'directory' as const;
  constructor(public entry: MockEntry, public name: string = '') {
    if (!entry.children) entry.children = new Map();
  }

  async getFileHandle(
    name: string,
    opts?: { create?: boolean },
  ): Promise<MockFileHandle> {
    const children = this.entry.children!;
    let child = children.get(name);
    if (!child) {
      if (!opts?.create) throw new DOMException('NotFoundError', 'NotFoundError');
      child = { kind: 'file', content: '' };
      children.set(name, child);
    }
    if (child.kind !== 'file') throw new DOMException('TypeMismatchError', 'TypeMismatchError');
    return new MockFileHandle(child);
  }

  async getDirectoryHandle(
    name: string,
    opts?: { create?: boolean },
  ): Promise<MockDirectoryHandle> {
    const children = this.entry.children!;
    let child = children.get(name);
    if (!child) {
      if (!opts?.create) throw new DOMException('NotFoundError', 'NotFoundError');
      child = { kind: 'directory', children: new Map() };
      children.set(name, child);
    }
    if (child.kind !== 'directory') {
      throw new DOMException('TypeMismatchError', 'TypeMismatchError');
    }
    return new MockDirectoryHandle(child, name);
  }

  async removeEntry(name: string): Promise<void> {
    const children = this.entry.children!;
    if (!children.has(name)) {
      throw new DOMException('NotFoundError', 'NotFoundError');
    }
    children.delete(name);
  }

  async *entries(): AsyncIterableIterator<[string, MockFileHandle | MockDirectoryHandle]> {
    for (const [name, child] of this.entry.children!) {
      if (child.kind === 'file') {
        yield [name, new MockFileHandle(child)];
      } else {
        yield [name, new MockDirectoryHandle(child, name)];
      }
    }
  }
}

export async function createOPFSMock(): Promise<FileSystemDirectoryHandle> {
  const root: MockEntry = { kind: 'directory', children: new Map() };
  return new MockDirectoryHandle(root) as unknown as FileSystemDirectoryHandle;
}
