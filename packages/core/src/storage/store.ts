export interface DirEntry {
  name: string;
  kind: 'file' | 'directory';
}

export interface Store {
  writeText(path: string, content: string): Promise<void>;
  readText(path: string): Promise<string>;
  writeJSON(path: string, value: unknown): Promise<void>;
  readJSON<T>(path: string): Promise<T>;
  writeBinary(path: string, data: Uint8Array | ArrayBuffer): Promise<void>;
  /**
   * Read a binary file. Throws if file not found.
   * Used to attach PDF binaries to LLM requests.
   */
  readBinary(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  listDir(path: string): Promise<DirEntry[]>;
  remove(path: string): Promise<void>;
}
