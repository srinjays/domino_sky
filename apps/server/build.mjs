import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  platform: 'node',
  format: 'esm',
  bundle: true,
  external: ['express', 'cors', 'helmet', 'express-rate-limit', 'zod'],
  target: 'node22',
});
