import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // Stub remotion imports for pure-function tests
      remotion: new URL("./src/__mocks__/remotion.ts", import.meta.url).pathname,
    },
  },
});
