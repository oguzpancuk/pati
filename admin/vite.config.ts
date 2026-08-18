import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Geliştirmede API'yi aynı origin üzerinden proxy'liyoruz: böylece CORS ve
// karışık içerik (mixed content) sorunları geliştirme sırasında hiç çıkmıyor,
// üretimde de panel API ile aynı alan adı altında sunulabiliyor.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: process.env.API_URL || 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: process.env.API_URL || 'http://localhost:3000', changeOrigin: true },
    },
  },
});
