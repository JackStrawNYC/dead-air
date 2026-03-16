import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@visualizer": path.resolve(__dirname, "../visualizer-poc/src"),
    },
  },
});
