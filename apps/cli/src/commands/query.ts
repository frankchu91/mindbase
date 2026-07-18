import type { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadConfig } from '../config.js';
import { out } from '../output.js';

export function queryCmd(program: Command): void {
  program
    .command('query <question...>')
    .description('Search the wiki INDEX for matching pages')
    .action(async (questionParts: string[]) => {
      const cfg = await loadConfig();
      const q = questionParts.join(' ').toLowerCase();
      try {
        const body = await fs.readFile(path.join(cfg.dataDir, 'wiki', 'INDEX.md'), 'utf8');
        const lines = body.split('\n').filter((l) => l.startsWith('- [') && l.toLowerCase().includes(q));
        if (lines.length === 0) {
          out.warn(`No matches in INDEX. Try \`mindbase rebuild-index\` first.`);
        } else {
          out.header(`${lines.length} matches`);
          for (const l of lines.slice(0, 20)) console.log('  ' + l);
        }
      } catch {
        out.err('No wiki/INDEX.md — run `mindbase init` first.');
      }
    });
}
