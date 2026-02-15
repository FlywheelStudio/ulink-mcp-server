import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    mockReset: true,
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
