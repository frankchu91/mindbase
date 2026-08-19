// Build mindbase-app: bundle the server (with @mindbase/core inlined) and
// copy the built web UI. Native/prebuilt deps stay external and are declared
// as regular dependencies in package.json.
import { build } from 'esbuild';
import { cp, rm, stat, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const webDist = path.join(repo, 'apps/web/dist');

try {
  await stat(path.join(webDist, 'index.html'));
} catch {
  console.error(`✗ apps/web/dist missing — run: pnpm --filter @mindbase/web build`);
  process.exit(1);
}

await rm(path.join(here, 'dist'), { recursive: true, force: true });
await mkdir(path.join(here, 'dist'), { recursive: true });

await build({
  entryPoints: [path.join(repo, 'apps/server/src/index.ts')],
  outfile: path.join(here, 'dist/server.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  logLevel: 'info',
  external: ['better-sqlite3', 'sharp', '@xenova/transformers', 'onnxruntime-node', 'argon2', 'tesseract.js', 'jsdom', 'node-cron'],
  // import.meta.dirname is used by the server for path resolution; esbuild
  // keeps it as-is under esm/node20, which resolves to dist/ at runtime.
  banner: {
    // some CJS deps use require() at top level after esbuild interop
    js: "import { createRequire as __mbCreateRequire } from 'node:module'; const require = __mbCreateRequire(import.meta.url);",
  },
});

await cp(webDist, path.join(here, 'dist/web'), { recursive: true });
console.log('✓ dist/server.js + dist/web ready');
