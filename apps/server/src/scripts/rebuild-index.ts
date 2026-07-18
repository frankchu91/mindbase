/**
 * Regenerate wiki/INDEX.md from the on-disk state of wiki/{concepts,notes,sources}/.
 * Run after any out-of-band migration, or when INDEX.md falls behind.
 *
 * Usage: pnpm -F @mindbase/server tsx src/scripts/rebuild-index.ts
 */
import path from 'node:path';
import os from 'node:os';
import { FileStore, rebuildIndex } from '@mindbase/core';

async function main(): Promise<void> {
  const dataRoot = process.env['MINDBASE_DATA_DIR'] ?? path.join(os.homedir(), 'mindbase-data');
  console.log(`Rebuilding wiki/INDEX.md from ${dataRoot}\n`);
  const store = new FileStore(dataRoot);
  const result = await rebuildIndex(store);
  console.log(`✓ INDEX.md rebuilt.`);
  console.log(`  Total pages: ${result.totalPages}`);
  console.log(`    Concepts (LLM-owned): ${result.concepts}`);
  console.log(`    Drafts   (user):      ${result.drafts}`);
  console.log(`  Source stubs:           ${result.sources}`);
}

main().catch((e) => {
  console.error('rebuild-index failed:', e);
  process.exit(1);
});
