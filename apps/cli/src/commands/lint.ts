import type { Command } from 'commander';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileStore, WikiIndex, reindex, lintWiki } from '@mindbase/core';
import { loadConfig } from '../config.js';
import { out } from '../output.js';

export function lintCmd(program: Command): void {
  program
    .command('lint')
    .description('Run wiki lint checks (orphan / missing-concept / stale)')
    .action(async () => {
      try {
        const cfg = await loadConfig();
        const store = new FileStore(cfg.dataDir);
        const dbPath = path.join(os.tmpdir(), `mindbase-cli-wiki-${Date.now()}.sqlite`);
        const wikiIndex = WikiIndex.open(dbPath);
        await reindex(store, wikiIndex);
        const report = await lintWiki(store, wikiIndex);
        wikiIndex.close();

        out.header(
          `Lint report — ${report.findings.length} findings across ${report.total_pages_checked} pages`,
        );
        out.info(`  Orphans: ${report.byKind.orphan}`);
        out.info(`  Missing concepts: ${report.byKind['missing-concept']}`);
        out.info(`  Stale pages: ${report.byKind['stale-page']}`);
        console.log();
        for (const f of report.findings) {
          console.log(`  [${f.kind}] ${f.title}`);
          out.dim(`    → ${f.reason}`);
        }
      } catch (err) {
        out.err(`Lint failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
