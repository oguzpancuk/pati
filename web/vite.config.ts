import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The web client imports the mobile side's vocabulary and avatar definitions
// DIRECTLY (no copies): taxonomy.ts, avatars.ts etc. are pure TypeScript with
// no react-native dependencies. The SVG generators come from shared/ at the
// repo root and are shared with admin. Hence fs.allow opens to the repo root.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      '@mobile': fileURLToPath(new URL('../mobile/src', import.meta.url)),
    },
  },
  // esbuild normally looks up the nearest tsconfig for every file it
  // transforms; for @mobile/* files that finds mobile/tsconfig.json, whose
  // "extends" only resolves when mobile's node_modules are installed. CI's
  // web job (and any fresh clone) doesn't install them, so the build died
  // there while passing locally. A fixed inline tsconfig removes the lookup:
  // these are the only two options esbuild actually needs from it.
  esbuild: {
    tsconfigRaw: '{"compilerOptions":{"jsx":"react-jsx","useDefineForClassFields":true}}',
  },
  server: {
    port: 5175,
    // For checking from a phone: host=true also listens on external
    // interfaces (same Wi‑Fi, http://<mac-ip>:5175). iOS Safari grants no
    // location permission over http and runs no service worker, so a real
    // PWA try needs HTTPS — the no-account path is a Cloudflare quick tunnel:
    //   TUNNEL=1 npm run dev  &&  cloudflared tunnel --url http://localhost:5175
    // With TUNNEL=1 the HMR client connects to 443/wss (the tunnel doesn't
    // expose 5175).
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    hmr: process.env.TUNNEL ? { clientPort: 443, protocol: 'wss' } : undefined,
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target: process.env.API_URL || 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: process.env.API_URL || 'http://localhost:3000', changeOrigin: true },
    },
  },
});
