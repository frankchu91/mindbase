import type { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { FileStore, ensureSchema } from '@mindbase/core';
import { out } from '../output.js';

export function initCmd(program: Command): void {
  program
    .command('init')
    .description('Scaffold wiki/{concepts,notes,sources} + schema.md + INDEX.md in the current directory')
    .option('--force', 'overwrite existing files')
    .action(async (opts: { force?: boolean }) => {
      const cwd = process.cwd();
      const indexPath = path.join(cwd, 'wiki', 'INDEX.md');
      const exists = await fs.access(indexPath).then(() => true).catch(() => false);
      if (exists && !opts.force) {
        out.err('Wiki already exists here (wiki/INDEX.md found). Use --force to overwrite.');
        process.exit(1);
      }
      // Make the dirs
      for (const sub of ['wiki/concepts', 'wiki/notes', 'wiki/sources']) {
        await fs.mkdir(path.join(cwd, sub), { recursive: true });
      }
      const store = new FileStore(cwd);
      await ensureSchema(store);
      // Empty starter files
      await fs.writeFile(path.join(cwd, 'wiki', 'INDEX.md'),
        '# MindBase Wiki Index\n\n_Auto-maintained — run `mindbase rebuild-index`._\n', 'utf8');
      await fs.writeFile(path.join(cwd, 'wiki', 'log.md'),
        '# MindBase Wiki Log\n\n', 'utf8');
      await fs.writeFile(path.join(cwd, '.mindbase.json'),
        JSON.stringify({ dataDir: '.', adapter: 'anthropic' }, null, 2), 'utf8');
      out.ok(`Scaffolded MindBase wiki in ${cwd}`);
      out.info('Next: set ANTHROPIC_API_KEY, then run `mindbase ingest <file-or-url>`.');
    });
}
