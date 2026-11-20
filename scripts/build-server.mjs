// Empacota o servidor (TypeScript) em um único arquivo ESM em dist/server e grava dist/build.json (commit e "cópia
// modificada", ver scripts/build-info.mjs).
import { build } from 'esbuild';
import { writeBuildInfo } from './build-info.mjs';

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});

// The machine tokens of HABBLAUD_INGEST, runnable where only dist/ exists (the Docker image):
// `node dist/server/ingest-token.js add <name>`.
await build({
  entryPoints: ['scripts/ingest-token.ts'],
  outfile: 'dist/server/ingest-token.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  logLevel: 'info',
});

const info = writeBuildInfo('dist/build.json');
console.log(`  dist/build.json  ${info.commit === 'unknown' ? 'unknown' : info.commit.slice(0, 12)}${info.dirty ? ' (dirty)' : ''}`);
