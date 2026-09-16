import { defineConfig } from "vitest/config";

// Only pure TypeScript helpers are tested here (no React Native runtime): see README "Tests".
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});