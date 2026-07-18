#!/usr/bin/env node
import { Command } from 'commander';
import { initCmd } from './commands/init.js';
import { ingestCmd } from './commands/ingest.js';
import { lintCmd } from './commands/lint.js';
import { queryCmd } from './commands/query.js';
import { rebuildIndexCmd } from './commands/rebuild-index.js';

const program = new Command();
program
  .name('mindbase')
  .description('Karpathy LLM-Wiki pattern as a CLI — local AI-maintained research wiki.')
  .version('0.0.1');

initCmd(program);
ingestCmd(program);
lintCmd(program);
queryCmd(program);
rebuildIndexCmd(program);

program.parseAsync(process.argv).catch((e) => {
  console.error('Error:', (e as Error).message);
  process.exit(1);
});
