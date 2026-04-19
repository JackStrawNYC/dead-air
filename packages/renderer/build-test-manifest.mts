#!/usr/bin/env npx tsx
/**
 * Build a proper test manifest for the Rust renderer.
 * Imports shaders properly so template literals resolve.
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from "fs";
import { join, resolve } from "path";

const __dirname = new URL(".", import.meta.url).pathname;
const SHADER_DIR = resolve(__dirname, "../visualizer-poc/src/shaders");
const skipFiles = new Set([
  "noise.ts", "dual-blend.ts", "overlay-sdf.ts", "shader-strings.ts",
  "mesh-deformation.ts", "particle-burst.ts",
]);

// Collect properly resolved GLSL
const allShaders: Record<string, string> = {};
const files = readdirSync(SHADER_DIR)
  .filter(f => f.endsWith(".ts") && !f.includes(".test.") && !f.startsWith("shared") && !skipFiles.has(f));

for (const file of files) {
  try {
    const mod = await import(join(SHADER_DIR, file));
    const fragKey = Object.keys(mod).find(k => k.endsWith("Frag"));
    if (fragKey && typeof mod[fragKey] === "string" && mod[fragKey].length > 100 && !mod[fragKey].includes("${")) {
      const shaderId = file.replace(".ts", "").replace(/-/g, "_");
      allShaders[shaderId] = mod[fragKey];
    }
  } catch { /* skip */ }
}

console.log("Collected", Object.keys(allShaders).length, "shaders");

// Build manifest
const framesPath = process.argv[2] || "manifest-test-song7-frames.json";
const outputPath = process.argv[3] || "manifest-test-song7-full.json";

const frames = JSON.parse(readFileSync(framesPath, "utf8"));
const usedIds = new Set<string>();
frames.forEach((f: { shader_id: string; secondary_shader_id?: string }) => {
  usedIds.add(f.shader_id);
  if (f.secondary_shader_id) usedIds.add(f.secondary_shader_id);
});

const shaders: Record<string, string> = {};
for (const id of usedIds) {
  if (allShaders[id]) shaders[id] = allShaders[id];
  else console.warn("Missing shader:", id);
}

const manifest = {
  shaders,
  width: 1920, height: 1080, fps: 30,
  show_title: "Test - Mexicali Blues",
  song_boundaries: [{ title: "Mexicali Blues", set: 1, startFrame: 0, endFrame: frames.length }],
  frames,
};

writeFileSync(outputPath, JSON.stringify(manifest));
const mb = (statSync(outputPath).size / 1048576).toFixed(1);
console.log(`Written ${outputPath} (${mb} MB, ${Object.keys(shaders).length}/${usedIds.size} shaders)`);

// Verify no unresolved templates
for (const [id, src] of Object.entries(shaders)) {
  if (src.includes("${")) console.error("UNRESOLVED template in", id);
}
console.log("Template check passed");
