import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The manifest lets scripts/check-bundle.mjs measure what each route downloads (D3).
  build: { manifest: true },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Forward /api calls to the Flask backend (no CORS setup needed)
    proxy: { "/api": "http://127.0.0.1:5000" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: false,
  },
});
