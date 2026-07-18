import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  dts: true,
  splitting: false,
  // Bundle @mindbase/core inline so dist is self-contained
  noExternal: ['@mindbase/core'],
  // Native modules + heavy optional deps stay external so npm pulls them
  // in fresh per-install and ABI mismatches are avoided.
  external: ['better-sqlite3', '@xenova/transformers', 'onnxruntime-node'],
  outDir: 'dist',
  clean: true,
});
