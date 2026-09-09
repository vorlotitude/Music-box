import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Renderer (React) build configuration.
// The Electron main/preload are compiled separately by tsc (see postinstall in package.json).
export default defineConfig({
  plugins: [react()],
  root: ".",
  base: "./",
  resolve: {
    alias: {
      "@core": resolve(__dirname, "core/src"),
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});