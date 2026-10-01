import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The Dunda admin app.
 *
 * Deployed on its own, separate from the club app, so that club users never
 * receive this bundle and the admin surface can be locked down far harder than
 * something that has to open on a tablet behind a bar.
 */
const port = Number(process.env.PORT ?? 5199);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  root: import.meta.dirname,
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    // The admin app talks to the same API, through the same relative paths, so
    // the two apps can share an origin in production.
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT ?? '3000'}`,
        changeOrigin: true,
      },
    },
  },
});
