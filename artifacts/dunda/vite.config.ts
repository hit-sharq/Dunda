import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT ?? '5173');

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  // The single .env lives at the repo root, and this app historically used
  // NEXT_PUBLIC_* names. Point Vite at that file and expose both prefixes so
  // the Clerk keys and the DATABASE_URL-backed settings resolve in development.
  envDir: path.resolve(import.meta.dirname, '../..'),
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [react(), tailwindcss({ optimize: false })],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    // Standard location, which is what every hosting platform expects.
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    // The web client calls relative `/api` URLs, so in development those have to
    // be forwarded to the API server. WebSocket upgrades are proxied too so the
    // realtime bus works without extra configuration.
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? '3000'}`,
        changeOrigin: true,
        ws: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
