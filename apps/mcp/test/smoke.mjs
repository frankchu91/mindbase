import { spawn } from 'node:child_process';
const proc = spawn('node', ['dist/cli.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
const req = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
proc.stdin.write(JSON.stringify(req) + '\n');
let out = '';
proc.stdout.on('data', (c) => { out += c; if (out.includes('search_wiki')) { console.log('OK: tool listed'); proc.kill(); process.exit(0); } });
setTimeout(() => { console.error('FAIL'); proc.kill(); process.exit(1); }, 3000);
