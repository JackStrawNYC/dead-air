/**
 * Export all Dead Air shader GLSL strings to individual files for batch naga validation.
 * Run: npx tsx export-shaders.mts
 */
import { readdirSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const __dirname = new URL(".", import.meta.url).pathname;
const shaderDir = join(__dirname, "../visualizer-poc/src/shaders");
const outDir = "/tmp/dead-air-glsl";
mkdirSync(outDir, { recursive: true });

const skipFiles = new Set([
  "noise.ts", "dual-blend.ts", "overlay-sdf.ts", "shader-strings.ts",
  "mesh-deformation.ts", "particle-burst.ts",
]);

const files = readdirSync(shaderDir)
  .filter(f => f.endsWith(".ts") && !f.includes(".test.") && !f.startsWith("shared") && !skipFiles.has(f));

let count = 0;
const errors: string[] = [];

for (const file of files) {
  try {
    const mod = await import(join(shaderDir, file));
    const fragKey = Object.keys(mod).find(k => k.endsWith("Frag"));
    if (fragKey && typeof mod[fragKey] === "string" && mod[fragKey].length > 100) {
      writeFileSync(join(outDir, file.replace(".ts", ".glsl")), mod[fragKey]);
      count++;
    }
  } catch (e: any) {
    errors.push(`${file}: ${e.message?.slice(0, 80)}`);
  }
}

console.log(`Exported ${count} shader GLSL strings to ${outDir}`);
if (errors.length) {
  console.log(`Errors (${errors.length}):`);
  errors.forEach(e => console.log(`  ${e}`));
}
