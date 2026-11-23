import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The Habblaud client. In `npm run dev` the server uses this config in middleware mode;
// `npm run dev:client` starts Vite alone (use ?mock=1 for simulated data in the browser).
export default defineConfig({
  root: r('./client'),
  // The browser gets only the active language's dictionary (client/src/main.ts), not all of them: see shared/locales/all.ts.
  resolve: { alias: [{ find: /^\.\/locales\/all$/, replacement: r('./shared/locales/none.ts') }] },
  publicDir: r('./client/public'),
  build: {
    outDir: r('./dist/client'),
    emptyOutDir: true,
    // Hashed build files go to /bundle/ (immutable cache on the server); /assets/ is only for
    // client/public (fixed names, revalidated on every request). See server/http/static.ts.
    assetsDir: 'bundle',
    assetsInlineLimit: 0,
    rollupOptions: { input: { main: r('./client/index.html') } },
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      '/api': { target: `http://127.0.0.1:${process.env.HABBLAUD_PORT ?? 4747}` },
    },
  },
});
