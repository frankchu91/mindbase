#!/usr/bin/env node
// mindbase-app: start the MindBase server + web UI with one command.
//   npx mindbase-app [--port N] [--no-open]
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(here, '../dist/server.js');
const webDist = path.join(here, '../dist/web');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`mindbase-app — Karpathy's LLM Wiki, as a product

Usage: npx mindbase-app [options]

Options:
  --port N     Port to listen on (default 4321)
  --no-open    Don't open the browser
  -h, --help   Show this help

Data lives in ~/mindbase-data as plain markdown.
Docs: https://github.com/frankchu91/mindbase`);
  process.exit(0);
}

const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? Number(args[portIdx + 1]) : Number(process.env.PORT ?? 4321);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`✗ invalid port: ${args[portIdx + 1]}`);
  process.exit(1);
}
const noOpen = args.includes('--no-open');

// Fail fast on a busy port — never print a URL that belongs to another app.
const busy = await new Promise((resolve) => {
  const probe = net.createServer();
  probe.once('error', () => resolve(true));
  probe.once('listening', () => probe.close(() => resolve(false)));
  probe.listen(port, '127.0.0.1');
});
if (busy) {
  console.error(`✗ port ${port} is already in use (another MindBase, or something else).
  Try: npx mindbase-app --port ${port + 1}`);
  process.exit(1);
}

const child = spawn(process.execPath, [serverEntry], {
  env: { ...process.env, PORT: String(port), MINDBASE_WEB_DIST: webDist },
  stdio: ['ignore', 'inherit', 'inherit'],
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}

const url = `http://localhost:${port}`;
const deadline = Date.now() + 10_000;
let up = false;
while (Date.now() < deadline) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/config`);
    if (r.ok) { up = true; break; }
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}

if (up) {
  console.log(`
  MindBase is running
  → ${url}
  → data: ~/mindbase-data (plain markdown)
  Ctrl-C to stop
`);
  if (!noOpen) {
    const opener = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';
    execFile(opener, process.platform === 'win32' ? ['', url] : [url], () => { /* best-effort */ });
  }
} else {
  console.error('✗ server did not become ready within 10s — see output above');
  child.kill('SIGTERM');
  process.exit(1);
}
