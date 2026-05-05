import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    clearMocks: true,
    environment: "node",
    hookTimeout: 30_000,
    include: [
      "src/**/*.test.ts",
      "test/unit/**/*.test.ts",
      "test/integration/**/*.test.ts",
      "test/e2e/**/*.test.ts",
    ],
    coverage: {
      exclude: ["src/**/*.test.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
        "src/cli/output/**": {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
        "src/core/**": {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },
    restoreMocks: true,
    testTimeout: 30_000,
  },
});
