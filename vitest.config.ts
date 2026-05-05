import { defineConfig } from "vitest/config";

export default defineConfig({
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
    passWithNoTests: true,
    restoreMocks: true,
    testTimeout: 30_000,
  },
});
