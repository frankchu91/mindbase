import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  // No banner needed: src/index.ts already has #!/usr/bin/env node shebang
  // which tsup preserves in the output. Adding a banner here would duplicate it.
  // Bundle @mindbase/core (and its transitive deps) into the output so
  // the dist is a single self-contained file. Node deps that have native
  // bindings or shouldn't be inlined go in `external`.
  noExternal: ['@mindbase/core'],
  external: [
    'better-sqlite3',     // native binding, must remain external
    '@xenova/transformers', // pulls in onnxruntime-node (native), must remain external
    'onnxruntime-node',   // native ONNX runtime binding
  ],
  // Keep TypeScript-strict-style esbuild output
  splitting: false,
  sourcemap: false,
  minify: false,
});
