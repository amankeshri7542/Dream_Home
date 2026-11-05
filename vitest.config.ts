import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    // Some domain tests walk every room of every sample home: seconds alone, longer when the whole suite runs at once.
    testTimeout: 20_000,
  },
});
