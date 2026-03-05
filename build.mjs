import { build } from 'esbuild';

const watch = process.argv.includes('--watch');

await build({
  entryPoints: ['src/bin.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/bin.js',
  external: ['@modelcontextprotocol/sdk', 'chokidar'],
  banner: { js: '#!/usr/bin/env node' },
  ...(watch ? { watch: true } : {}),
});
