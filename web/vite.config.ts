import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Web istemcisi mobil taraftaki sözlüğü ve avatar tanımlarını DOĞRUDAN import
// ediyor (kopya değil): taxonomy.ts ve avatars.ts saf TypeScript, react-native
// bağımlılıkları yok. SVG üreticileri de repo kökündeki shared/ altından
// geliyor ve admin ile ortak. Bu yüzden fs.allow repo köküne açık.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      '@mobile': fileURLToPath(new URL('../mobile/src', import.meta.url)),
    },
  },
  server: {
    port: 5175,
    // Telefondan bakmak için: host=true dış arayüzlerde de dinler (aynı Wi‑Fi,
    // http://<mac-ip>:5175). iOS Safari http üzerinden konum izni vermediği ve
    // service worker çalışmadığı için gerçek PWA denemesi HTTPS ister — hesap
    // gerektirmeyen yol Cloudflare quick tunnel:
    //   TUNNEL=1 npm run dev  &&  cloudflared tunnel --url http://localhost:5175
    // TUNNEL=1 iken HMR istemcisi 443/wss'e bağlanır (tünel 5175'i dışarı açmıyor).
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
