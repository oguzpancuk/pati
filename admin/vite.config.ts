import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API is proxied through the same origin: CORS and mixed-
// content problems never appear during development, and in production the
// panel is served under the same domain as the API.
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
