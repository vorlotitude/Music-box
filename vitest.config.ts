import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@core": resolve(__dirname, "core/src"),
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["core/**/*.test.ts", "electron/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["core/src/**/*.ts"],
    },
  },
});