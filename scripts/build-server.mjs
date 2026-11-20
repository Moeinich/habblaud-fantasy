// Bundles the server (TypeScript) into a single ESM file in dist/server.
import { build } from 'esbuild';

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
