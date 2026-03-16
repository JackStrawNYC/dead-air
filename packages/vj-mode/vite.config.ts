import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@visualizer": path.resolve(__dirname, "../visualizer-poc/src"),
    },
  },
  optimizeDeps: {
    exclude: ["@dead-air/visualizer-poc"],
  },
});
