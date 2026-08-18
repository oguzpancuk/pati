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
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target: process.env.API_URL || 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: process.env.API_URL || 'http://localhost:3000', changeOrigin: true },
    },
  },
});
