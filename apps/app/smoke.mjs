// Pack-smoke: prove the PUBLISHED artifact works, not the repo layout.
// npm pack → install tarball into a temp dir → run the bin → assert the
// API answers and the web shell is served → clean shutdown.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4399;
let failed = false;
const tmp = await mkdtemp(path.join(tmpdir(), 'mindbase-app-smoke-'));

try {
  console.log('· packing…');
  execFileSync('npm', ['pack', '--pack-destination', tmp], { cwd: here, stdio: 'pipe' });
  const tarball = (await readdir(tmp)).find((f) => f.endsWith('.tgz'));
  if (!tarball) throw new Error('npm pack produced no tarball');

  console.log('· installing tarball into temp dir…');
  execFileSync('npm', ['init', '-y'], { cwd: tmp, stdio: 'pipe' });
  execFileSync('npm', ['install', path.join(tmp, tarball)], { cwd: tmp, stdio: 'pipe' });

  console.log('· starting bin…');
  const bin = path.join(tmp, 'node_modules', '.bin', 'mindbase-app');
  const child = spawn(bin, ['--no-open', '--port', String(PORT)], { stdio: 'pipe' });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));

  const deadline = Date.now() + 30_000;
  let apiOk = false;
  while (Date.now() < deadline && !apiOk) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/config`);
      apiOk = r.ok;
    } catch { /* not yet */ }
    if (!apiOk) await new Promise((r) => setTimeout(r, 400));
  }
  if (!apiOk) throw new Error(`API never became ready. Output:\n${out.slice(-2000)}`);
  console.log('✓ /api/config 200');

  const shell = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
  if (!shell.includes('<div id="root"')) throw new Error(`web shell not served:\n${shell.slice(0, 300)}`);
  console.log('✓ web shell served');

  child.kill('SIGTERM');
  await new Promise((r) => child.on('exit', r));
  console.log('✓ clean shutdown — pack-smoke PASSED');
} catch (e) {
  failed = true;
  console.error('✗ pack-smoke FAILED:', e.message);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
