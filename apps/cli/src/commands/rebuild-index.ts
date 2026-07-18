import type { Command } from 'commander';
import { FileStore, rebuildIndex } from '@mindbase/core';
import { loadConfig } from '../config.js';
import { out } from '../output.js';

export function rebuildIndexCmd(program: Command): void {
  program
    .command('rebuild-index')
    .description('Regenerate wiki/INDEX.md from on-disk pages')
    .action(async () => {
      const cfg = await loadConfig();
      const store = new FileStore(cfg.dataDir);
      const r = await rebuildIndex(store);
      out.ok(`INDEX.md rebuilt — ${r.totalPages} pages (${r.concepts} concepts + ${r.drafts} drafts)`);
    });
}
