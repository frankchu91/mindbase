// apps/mcp/src/lib/safe-write.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { lock } from 'proper-lockfile';

/** Atomic write: write to .tmp, fsync, rename. */
export async function atomicWrite(filePath: string, content: string | Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, filePath);
}

/** Run fn under a file lock. The lock file lives next to the target. */
export async function withLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const release = await lock(filePath, { retries: { retries: 5, minTimeout: 50, maxTimeout: 500 }, realpath: false });
  try {
    return await fn();
  } finally {
    await release();
  }
}
