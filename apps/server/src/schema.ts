import type { Store } from '@mindbase/core';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Directory containing the default schema .md files shipped with the project */
const SCHEMA_DIR = path.resolve(import.meta.dirname, '../../../schema');

const SCHEMA_FILES = ['ingest.md', 'query.md', 'lint.md', 'conventions.md', 'synthesis.md'];

/**
 * Ensure schema/ directory exists in the user's data dir.
 * Copies default .md files from the project's schema/ directory
 * only if they don't already exist in the user's data dir.
 */
export async function ensureSchema(store: Store): Promise<void> {
  for (const file of SCHEMA_FILES) {
    const targetPath = `schema/${file}`;
    if (await store.exists(targetPath)) continue;

    const sourcePath = path.join(SCHEMA_DIR, file);
    const content = await fs.readFile(sourcePath, 'utf-8');
    await store.writeText(targetPath, content);
  }
}
