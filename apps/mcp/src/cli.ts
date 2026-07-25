#!/usr/bin/env node
// apps/mcp/src/cli.ts
import { runServer } from './index.js';

interface ParsedArgs {
  dataDir?: string;
  showVersion: boolean;
  showHelp: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { showVersion: false, showHelp: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data-dir' && argv[i + 1]) {
      out.dataDir = argv[++i];
    } else if (a === '--version' || a === '-v') {
      out.showVersion = true;
    } else if (a === '--help' || a === '-h') {
      out.showHelp = true;
    }
  }
  return out;
}

const HELP = `mindbase-mcp-server [options]

Options:
  --data-dir <path>    Override data directory (default: ~/mindbase-data)
  --version, -v        Print version
  --help, -h           Show this help`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.showHelp) {
    console.log(HELP);
    return;
  }
  if (args.showVersion) {
    // Version is hardcoded here; bumped at release time.
    console.log('mindbase-mcp 0.1.3');
    return;
  }

  try {
    await runServer({ dataDir: args.dataDir });
  } catch (e) {
    process.stderr.write(`[mindbase-mcp] fatal: ${(e as Error).message}\n`);
    process.exit(1);
  }
}

main();
